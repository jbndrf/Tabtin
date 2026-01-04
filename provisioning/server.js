// Simple provisioning server - Proof of Concept
// Run: node provisioning/server.js

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = 3333;

// Coolify configuration
const COOLIFY_URL = 'http://192.168.1.70:8000';
const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN || 'P7vpD2UBcAFdaTEVh8hFfxNMcNaruYBJXDZImON7b1331c1a';
const PROJECT_UUID = 'pwgoc8g48kc8c44w4g804owg'; // Your tabtin project
const SERVER_UUID = 'k04gko4sgs8c0k0cws40c8so'; // localhost server
const GIT_REPO = 'git@192.168.1.70:2222/janbndrf/tabtin.git';
const PRIVATE_KEY_UUID = 'jsg44080o4o4os8w0g80g048'; // fuer_git deploy key

// Tier configurations
const TIERS = {
  free: {
    INSTANCE_MAX_CONCURRENT_PROJECTS: '1',
    INSTANCE_MAX_PARALLEL_REQUESTS: '5',
    INSTANCE_MAX_REQUESTS_PER_MINUTE: '30'
  },
  paid: {
    INSTANCE_MAX_CONCURRENT_PROJECTS: '10',
    INSTANCE_MAX_PARALLEL_REQUESTS: '50',
    INSTANCE_MAX_REQUESTS_PER_MINUTE: '300'
  }
};

async function coolifyRequest(endpoint, method = 'GET', body = null) {
  const url = new URL(`/api/v1${endpoint}`, COOLIFY_URL);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method,
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };

  console.log(`API Request: ${method} ${url.href}`);
  if (body) console.log('Body:', JSON.stringify(body, null, 2));

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Response: ${res.statusCode}`);
        console.log('Data:', data.substring(0, 500));
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createInstance(username, password, email, tier) {
  console.log(`Creating ${tier} instance for: ${username}`);

  const tierConfig = TIERS[tier] || TIERS.free;

  // Step 1: Create new environment for this user
  const envResult = await coolifyRequest(`/projects/${PROJECT_UUID}/environments`, 'POST', {
    name: username
  });

  if (envResult.status !== 201 && envResult.status !== 200) {
    throw new Error(`Failed to create environment: ${JSON.stringify(envResult.data)}`);
  }

  const environmentName = username;
  console.log(`Created environment: ${environmentName}`);

  // Step 2: Create application in the new environment
  const appResult = await coolifyRequest('/applications/private-deploy-key', 'POST', {
    project_uuid: PROJECT_UUID,
    server_uuid: SERVER_UUID,
    environment_name: environmentName,
    private_key_uuid: PRIVATE_KEY_UUID,
    git_repository: GIT_REPO,
    git_branch: 'main',
    build_pack: 'dockercompose',
    ports_exposes: '80',
    name: username
  });

  if (appResult.status !== 201 && appResult.status !== 200) {
    throw new Error(`Failed to create application: ${JSON.stringify(appResult.data)}`);
  }

  const appUuid = appResult.data.uuid;
  console.log(`Created application: ${appUuid}`);

  // Step 3: Set environment variables
  // SERVICE_FQDN_FRONTEND is a Coolify magic var that configures Traefik routing
  const customDomain = `${username}.tabtin.bndrf.de`;
  const envVars = {
    POCKETBASE_ADMIN_EMAIL: email,
    POCKETBASE_ADMIN_PASSWORD: password,
    SERVICE_FQDN_FRONTEND: customDomain,
    ...tierConfig
  };

  for (const [key, value] of Object.entries(envVars)) {
    await coolifyRequest(`/applications/${appUuid}/envs`, 'POST', {
      key,
      value
    });
  }
  console.log('Set environment variables');

  // Step 4: Set custom Traefik labels for routing
  const traefikLabels = `traefik.enable=true
traefik.http.middlewares.gzip.compress=true
traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https
traefik.http.routers.http-0-${appUuid}.entryPoints=http
traefik.http.routers.http-0-${appUuid}.middlewares=redirect-to-https
traefik.http.routers.http-0-${appUuid}.rule=Host(\`${customDomain}\`) && PathPrefix(\`/\`)
traefik.http.routers.http-0-${appUuid}.service=http-0-${appUuid}
traefik.http.routers.https-0-${appUuid}.entryPoints=https
traefik.http.routers.https-0-${appUuid}.middlewares=gzip
traefik.http.routers.https-0-${appUuid}.rule=Host(\`${customDomain}\`) && PathPrefix(\`/\`)
traefik.http.routers.https-0-${appUuid}.service=https-0-${appUuid}
traefik.http.routers.https-0-${appUuid}.tls=true
traefik.http.routers.https-0-${appUuid}.tls.certresolver=letsencrypt
traefik.http.services.http-0-${appUuid}.loadbalancer.server.port=80
traefik.http.services.https-0-${appUuid}.loadbalancer.server.port=80`;

  const labelsResult = await coolifyRequest(`/applications/${appUuid}`, 'PATCH', {
    custom_labels: traefikLabels
  });

  if (labelsResult.status !== 200 && labelsResult.status !== 201) {
    console.warn(`Warning: Failed to set Traefik labels: ${JSON.stringify(labelsResult.data)}`);
  } else {
    console.log(`Set Traefik labels for ${customDomain}`);
  }

  // Step 5: Deploy
  await coolifyRequest(`/applications/${appUuid}/start`, 'POST');
  console.log('Deployment started');

  return {
    success: true,
    url: `https://${customDomain}`,
    uuid: appUuid
  };
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Serve HTML page
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    return;
  }

  // Handle provisioning request
  if (req.method === 'POST' && req.url === '/provision') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { username, password, email, tier } = JSON.parse(body);

        // Validate
        if (!username || !password || !email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields' }));
          return;
        }

        // Sanitize username (alphanumeric and hyphens only)
        const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (sanitizedUsername !== username.toLowerCase()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Username can only contain letters, numbers, and hyphens' }));
          return;
        }

        const result = await createInstance(sanitizedUsername, password, email, tier);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Provisioning error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Provisioning server running at http://localhost:${PORT}`);
  console.log('');
  console.log('Before using, set your Coolify API token:');
  console.log('  export COOLIFY_TOKEN=your_token_here');
  console.log('');
});

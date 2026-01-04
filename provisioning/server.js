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

// Predefined LLM endpoints for all instances
// These are synced to the database on startup, admin can enable/disable but not delete
const PREDEFINED_ENDPOINTS = [
  {
    alias: 'Qwen3-VL-8B',
    endpoint: 'http://192.168.1.47:8001/v1/chat/completions',
    apiKey: 'sk-anykey',
    model: 'unsloth/Qwen3-VL-8B-Instruct-FP8',
    maxInputTokensPerDay: 10000000,
    maxOutputTokensPerDay: 2000000,
    description: 'Local Qwen3 VL 8B - Higher quality',
    providerType: 'openai'
  },
  {
    alias: 'Qwen3-VL-4B',
    endpoint: 'http://192.168.1.47:8002/v1/chat/completions',
    apiKey: 'sk-anykey',
    model: 'unsloth/Qwen3-VL-4B-Instruct-FP8',
    maxInputTokensPerDay: 10000000,
    maxOutputTokensPerDay: 2000000,
    description: 'Local Qwen3 VL 4B - Faster processing',
    providerType: 'openai'
  }
];

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
  const customDomain = `${username}.tabtin.bndrf.de`;
  const envVars = {
    POCKETBASE_ADMIN_EMAIL: email,
    POCKETBASE_ADMIN_PASSWORD: password,
    CUSTOM_DOMAIN: customDomain,
    // JSON.stringify handles all escaping - Coolify stores it as a string
    PREDEFINED_ENDPOINTS: JSON.stringify(PREDEFINED_ENDPOINTS),
    ...tierConfig
  };

  for (const [key, value] of Object.entries(envVars)) {
    await coolifyRequest(`/applications/${appUuid}/envs`, 'POST', {
      key,
      value
    });
  }
  console.log('Set environment variables');

  // Step 4: Set custom build/start commands to inject Traefik labels dynamically
  // Use a build script that's part of the repo - simpler and avoids API escaping issues
  const customBuildCommand = `CUSTOM_DOMAIN=${customDomain} APP_UUID=${appUuid} sh ./scripts/coolify-build.sh`;
  const customStartCommand = `docker compose --env-file /artifacts/build-time.env -f docker-compose.yaml -f docker-compose.override.yaml up -d`;

  const commandResult = await coolifyRequest(`/applications/${appUuid}`, 'PATCH', {
    docker_compose_custom_build_command: customBuildCommand,
    docker_compose_custom_start_command: customStartCommand
  });

  if (commandResult.status !== 200 && commandResult.status !== 201) {
    console.warn(`Warning: Failed to set custom commands: ${JSON.stringify(commandResult.data)}`);
  } else {
    console.log('Set custom build/start commands for Traefik label injection');
  }

  console.log(`Configured for ${customDomain} (UUID: ${appUuid})`);

  // Step 5: Deploy
  await coolifyRequest(`/applications/${appUuid}/start`, 'POST');
  console.log('Deployment started');

  return {
    success: true,
    url: `https://${customDomain}`,
    uuid: appUuid,
    note: 'Instance is deploying. May take a few minutes to be ready.'
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

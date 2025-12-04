const PocketBase = require('pocketbase').default;

async function cleanup() {
  const pb = new PocketBase('http://127.0.0.1:8090');
  await pb.collection('_superusers').authWithPassword('admin@tabtin.de', 'admin1234567890');
  
  // Get all extraction_rows
  const rows = await pb.collection('extraction_rows').getFullList();
  console.log(`Found ${rows.length} total extraction_rows`);
  
  let deleted = 0;
  for (const row of rows) {
    // Check if any extraction in row_data has column_id starting with "field"
    const hasFieldId = row.row_data?.some(e => 
      typeof e.column_id === 'string' && e.column_id.startsWith('field')
    );
    
    if (hasFieldId) {
      await pb.collection('extraction_rows').delete(row.id);
      deleted++;
      console.log(`Deleted row ${row.id} (batch: ${row.batch})`);
    }
  }
  
  console.log(`\nDeleted ${deleted} stale extraction_rows with "field*" column IDs`);
}

cleanup().catch(console.error);

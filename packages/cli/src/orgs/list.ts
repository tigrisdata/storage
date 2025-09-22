export default async function list(options: Record<string, unknown>) {
  console.log('📋 Listing Organizations');

  const format = options.format || options.F || 'table';

  // Mock data for demonstration
  const organizations = [
    { id: '1', name: 'acme-corp', description: 'ACME Corporation', created: '2024-01-15' },
    { id: '2', name: 'startup-inc', description: 'Startup Inc.', created: '2024-02-01' },
    { id: '3', name: 'enterprise-ltd', description: 'Enterprise Ltd.', created: '2024-02-15' }
  ];

  if (format === 'json') {
    console.log(JSON.stringify(organizations, null, 2));
  } else if (format === 'xml') {
    console.log('<organizations>');
    organizations.forEach(org => {
      console.log(`  <organization>`);
      console.log(`    <id>${org.id}</id>`);
      console.log(`    <name>${org.name}</name>`);
      console.log(`    <description>${org.description}</description>`);
      console.log(`    <created>${org.created}</created>`);
      console.log(`  </organization>`);
    });
    console.log('</organizations>');
  } else {
    // Table format
    console.log('\n┌────┬──────────────────┬─────────────────────┬────────────┐');
    console.log('│ ID │ Name             │ Description         │ Created    │');
    console.log('├────┼──────────────────┼─────────────────────┼────────────┤');
    organizations.forEach(org => {
      const id = org.id.padEnd(2);
      const name = org.name.padEnd(16);
      const desc = org.description.padEnd(19);
      const created = org.created;
      console.log(`│ ${id} │ ${name} │ ${desc} │ ${created} │`);
    });
    console.log('└────┴──────────────────┴─────────────────────┴────────────┘\n');
  }

  console.log(`Found ${organizations.length} organization(s)`);
}
/**
 * tools/migrate/6_verify_migration.js
 * STEP 6: Verifikasi hasil migrasi Fase 2.
 *
 * Yang dicek:
 *   - Semua orders punya agent_id valid
 *   - Semua orders punya status baru (9 status)
 *   - Jumlah tagihan = jumlah hutang yang berhasil dimigrasi
 *   - Semua pembayaran punya tagihan_id
 *   - Roles dan permissions sudah ada
 *   - Settings sudah punya template_wa
 *   - Users sudah punya agent_id (untuk yang role agen_owner)
 *
 * Cara menjalankan:
 *   node tools/migrate/6_verify_migration.js
 */

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

function initFirebase() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    return sa.project_id;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return 'unknown';
  }
  console.error('❌ Set FIREBASE_SERVICE_ACCOUNT atau GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}

const STATUS_BARU = [
  'MENUNGGU_DIJEMPUT','SUDAH_DIJEMPUT','SEDANG_DIPROSES',
  'SEBAGIAN_SELESAI','SELESAI_DIKERJAKAN','SEDANG_DIANTAR',
  'SELESAI','TERTUNDA','DIBATALKAN'
];

async function cek(label, passed, detail = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} ${label.padEnd(45)} ${detail}`);
  return passed;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FASE 2 — Step 6: Verifikasi Migrasi');
  console.log('═══════════════════════════════════════════════════════\n');

  const projectId = initFirebase();
  const db = admin.firestore();
  console.log(`Project: ${projectId}\n`);

  let totalCek = 0, totalPass = 0;

  // ── 1. AGENTS ──────────────────────────────────────────────
  console.log('--- Collection: agents ---');
  const agentsSnap = await db.collection('agents').get();
  totalCek++; if (await cek('agents tidak kosong', agentsSnap.size > 0, `${agentsSnap.size} dokumen`)) totalPass++;

  const agentIds = new Set(agentsSnap.docs.map(d => d.id));
  const agentModes = {};
  agentsSnap.docs.forEach(d => {
    agentModes[d.id] = d.data().mode_tagihan;
  });

  const agentsDenganMode = agentsSnap.docs.filter(d => ['A','B','C'].includes(d.data().mode_tagihan)).length;
  totalCek++; if (await cek('Semua agents punya mode_tagihan valid', agentsDenganMode === agentsSnap.size,
    `${agentsDenganMode}/${agentsSnap.size}`)) totalPass++;

  // ── 2. USERS ───────────────────────────────────────────────
  console.log('\n--- Collection: users ---');
  const usersSnap = await db.collection('users').get();
  const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const agenOwnerUsers = usersData.filter(u => u.role === 'agen_owner');
  const agenOldRole    = usersData.filter(u => u.role === 'agen');
  const denganAgentId  = agenOwnerUsers.filter(u => u.agent_id).length;

  totalCek++; if (await cek('Tidak ada user role "agen" lama', agenOldRole.length === 0,
    agenOldRole.length > 0 ? `⚠️  masih ada ${agenOldRole.length}` : 'ok')) totalPass++;
  totalCek++; if (await cek('agen_owner punya agent_id', denganAgentId === agenOwnerUsers.length,
    `${denganAgentId}/${agenOwnerUsers.length}`)) totalPass++;

  // ── 3. ORDERS ──────────────────────────────────────────────
  console.log('\n--- Collection: orders ---');
  const ordersSnap = await db.collection('orders').get();
  const ordersData = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const ordersWithAgentId  = ordersData.filter(o => o.agent_id).length;
  const ordersStatusBaru   = ordersData.filter(o => STATUS_BARU.includes(o.status)).length;
  const ordersStatusLama   = ordersData.filter(o => !STATUS_BARU.includes(o.status)).length;
  const ordersSoftDelete   = ordersData.filter(o => o.is_deleted !== undefined).length;
  const ordersTracking     = ordersData.filter(o => o.total_received !== undefined).length;

  totalCek++; if (await cek('Semua orders punya agent_id', ordersWithAgentId === ordersSnap.size,
    `${ordersWithAgentId}/${ordersSnap.size}`)) totalPass++;
  totalCek++; if (await cek('Semua orders punya status baru', ordersStatusBaru === ordersSnap.size,
    `${ordersStatusBaru}/${ordersSnap.size}`)) totalPass++;
  totalCek++; if (await cek('Tidak ada orders status lama', ordersStatusLama === 0,
    ordersStatusLama > 0 ? `⚠️  ${ordersStatusLama} masih status lama` : 'ok')) totalPass++;
  totalCek++; if (await cek('Orders punya field is_deleted', ordersSoftDelete === ordersSnap.size,
    `${ordersSoftDelete}/${ordersSnap.size}`)) totalPass++;
  totalCek++; if (await cek('Orders punya tracking parsial', ordersTracking === ordersSnap.size,
    `${ordersTracking}/${ordersSnap.size}`)) totalPass++;

  // ── 4. TAGIHAN ─────────────────────────────────────────────
  console.log('\n--- Collection: tagihan ---');
  const tagihanSnap  = await db.collection('tagihan').get();
  const hutangSnap   = await db.collection('hutang').get();
  const tagihanData  = tagihanSnap.docs.map(d => d.data());
  const tagihanDenganMode = tagihanData.filter(t => ['A','B','C'].includes(t.mode)).length;

  totalCek++; if (await cek('tagihan.size >= hutang.size', tagihanSnap.size >= hutangSnap.size,
    `tagihan: ${tagihanSnap.size}, hutang: ${hutangSnap.size}`)) totalPass++;
  totalCek++; if (await cek('Semua tagihan punya mode', tagihanDenganMode === tagihanSnap.size,
    `${tagihanDenganMode}/${tagihanSnap.size}`)) totalPass++;

  // ── 5. INVOICES ────────────────────────────────────────────
  console.log('\n--- Collection: invoices ---');
  const invoicesSnap = await db.collection('invoices').get();
  const modeB = tagihanData.filter(t => t.mode === 'B').length;

  totalCek++; if (await cek('invoices.size >= tagihan mode B', invoicesSnap.size >= modeB,
    `invoices: ${invoicesSnap.size}, mode B: ${modeB}`)) totalPass++;

  // ── 6. PEMBAYARAN ──────────────────────────────────────────
  console.log('\n--- Collection: pembayaran ---');
  const bayarSnap = await db.collection('pembayaran').get();
  const bayarData = bayarSnap.docs.map(d => d.data());
  const bayarDenganTagihanId = bayarData.filter(b => b.tagihan_id).length;

  totalCek++; if (await cek('Semua pembayaran punya tagihan_id', bayarDenganTagihanId === bayarSnap.size,
    `${bayarDenganTagihanId}/${bayarSnap.size}`)) totalPass++;

  // ── 7. ROLES & PERMISSIONS ─────────────────────────────────
  console.log('\n--- Collection: roles & permissions ---');
  const rolesSnap      = await db.collection('roles').get();
  const permissionsSnap= await db.collection('permissions').get();

  totalCek++; if (await cek('roles tersedia', rolesSnap.size >= 5,
    `${rolesSnap.size} roles`)) totalPass++;
  totalCek++; if (await cek('permissions tersedia', permissionsSnap.size >= 40,
    `${permissionsSnap.size} permissions`)) totalPass++;

  const roleNames = rolesSnap.docs.map(d => d.data().nama);
  const requiredRoles = ['owner','admin','kurir','agen_owner','agen_staff'];
  const missingRoles = requiredRoles.filter(r => !roleNames.includes(r));
  totalCek++; if (await cek('5 role wajib ada', missingRoles.length === 0,
    missingRoles.length > 0 ? `❌ missing: ${missingRoles.join(', ')}` : 'ok')) totalPass++;

  // ── 8. SETTINGS ────────────────────────────────────────────
  console.log('\n--- Collection: settings ---');
  const settingsDoc = await db.collection('settings').doc('app').get();
  const settings    = settingsDoc.exists ? settingsDoc.data() : {};

  totalCek++; if (await cek('settings/app ada', settingsDoc.exists, '')) totalPass++;
  totalCek++; if (await cek('settings punya template_wa', !!settings.template_wa,
    settings.template_wa ? 'ada' : '❌ tidak ada')) totalPass++;
  totalCek++; if (await cek('settings punya website_url', !!settings.website_url,
    settings.website_url || '❌ tidak ada')) totalPass++;

  // ── 9. JADWAL ──────────────────────────────────────────────
  console.log('\n--- Collection: jadwal ---');
  const jadwalSnap  = await db.collection('jadwal').get();
  const jadwalDenganBatas = jadwalSnap.docs.filter(d => d.data().jam_batas).length;

  totalCek++; if (await cek('Jadwal punya jam_batas', jadwalDenganBatas === jadwalSnap.size,
    `${jadwalDenganBatas}/${jadwalSnap.size}`)) totalPass++;

  // ── SUMMARY ────────────────────────────────────────────────
  const allPass = totalPass === totalCek;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  HASIL VERIFIKASI: ${totalPass}/${totalCek} checks passed`);

  if (allPass) {
    console.log('\n  🎉 SEMUA VERIFIKASI BERHASIL!');
    console.log('  Fase 2 selesai. Siap lanjut ke Fase 3.');
    console.log('\n  LANGKAH TERAKHIR (manual):');
    console.log('  1. Update Firestore Security Rules via Firebase Console');
    console.log('     (paste rules dari JAYA-WENTER-BLUEPRINT-LOCKED.md)');
    console.log('  2. Test login semua role (owner, agen_owner, kurir)');
  } else {
    const failed = totalCek - totalPass;
    console.log(`\n  ⚠️  ${failed} verifikasi gagal. Periksa log di atas.`);
    console.log('  Perbaiki dulu sebelum lanjut ke Fase 3.');
  }

  console.log('═══════════════════════════════════════════════════════');

  // Simpan hasil verifikasi ke file
  const report = {
    timestamp: new Date().toISOString(),
    project_id: projectId,
    total_cek: totalCek,
    total_pass: totalPass,
    total_fail: totalCek - totalPass,
    status: allPass ? 'LULUS' : 'GAGAL'
  };
  fs.writeFileSync(
    path.join(__dirname, 'verify_report.json'),
    JSON.stringify(report, null, 2)
  );

  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});


import { buatOrderV2, updateStatusOrderWithLog } from './db.js';

async function runTests() {
  console.log('Running tests for order functions...');

  // Mock user context (match db.js expected shape)
  const userContext = {
    uid: 'test-user-uid',
    nama: 'Test User',
    email: 'test@example.com',
    role: 'agen_staff',
  };

  // Test buatOrderV2
  console.log('\nTesting buatOrderV2...');
  const orderData = {
    agen_uid: 'test-agen-uid',
    agen_nama: 'Test Agen',
    jumlah_pengguna: 10,
    warna: { hitam: 5, biru_tua: 5 },
    catatan: 'Order test via buatOrderV2',
  };

  try {
    const newOrder = await buatOrderV2(orderData, userContext);
    console.log('buatOrderV2 successful. New Order ID:', newOrder.id);

    // Test updateStatusOrderWithLog
    console.log('\nTesting updateStatusOrderWithLog...');
    const updated = await updateStatusOrderWithLog(newOrder.id, 'DIJEMPUT', userContext, 'Order dijemput oleh kurir');
    console.log('updateStatusOrderWithLog successful:', updated);

    const updated2 = await updateStatusOrderWithLog(newOrder.id, 'SELESAI', userContext, 'Order selesai');
    console.log('updateStatusOrderWithLog successful:', updated2);

  } catch (error) {
    console.error('Error during test:', error);
  }
  console.log('\nTests finished.');
}

runTests();

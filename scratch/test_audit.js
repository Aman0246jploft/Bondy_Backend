const axios = require('axios');

const baseUrl = 'http://localhost:8080/api/v1';
const adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTZmMmEwMGE0ODU5NGFlZjg5NjRhZjMiLCJyb2xlSWQiOjIsImlhdCI6MTc4MDM4MDM2OCwiZXhwIjoyNjQ0MzgwMzY4fQ.UVpy8eXWG5kNMIfvujmVBTPIHdvuAdFXizcpfE28_hc';
// Wait, roleId for SUPER_ADMIN might be 1. In verification.http it says adminToken roleId is 1.
// Let's copy the adminToken from verification.http exactly:
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTZmMmEwMGE0ODU5NGFlZjg5NjRhZjMiLCJyb2xlSWQiOjEsImlhdCI6MTc4MDM4MDM2OCwiZXhwIjoyNjQ0MzgwMzY4fQ.UVpy8eXWG5kNMIfvujmVBTPIHdvuAdFXizcpfE28_hc';

async function run() {
  try {
    const res = await axios.post(`${baseUrl}/verification/audit`, {
      userId: '6a1e80665979beee41cf5f4b',
      type: 'nationalId',
      action: 'reject',
      reason: 'Testing rejection reason',
      reasonTitle: 'Test Title'
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('Success:', res.data);
  } catch (err) {
    console.error('Error Status:', err.response?.status);
    console.error('Error Data:', err.response?.data);
  }
}

run();

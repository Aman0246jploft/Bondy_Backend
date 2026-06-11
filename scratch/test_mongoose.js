const mongoose = require('mongoose');
const User = require('../db/models/User');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bondy')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Find the test user
    const userId = '6a1e80665979beee41cf5f4b';
    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found');
      process.exit(0);
    }
    
    console.log('Initial Status:', user.verifications.idVerification.nationalId.status);
    
    // Reject it
    user.verifications.idVerification.nationalId.isVerified = false;
    user.verifications.idVerification.nationalId.status = 'rejected';
    user.verifications.idVerification.nationalId.rejectionReason = 'Test reject';
    
    user.markModified('verifications');
    await user.save();
    
    // Fetch fresh
    const updatedUser = await User.findById(userId);
    console.log('Status after rejection:', updatedUser.verifications.idVerification.nationalId.status);
    console.log('isVerified after rejection:', updatedUser.isVerified);
    console.log('organizerVerificationStatus after rejection:', updatedUser.organizerVerificationStatus);
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

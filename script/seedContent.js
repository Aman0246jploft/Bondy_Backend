require("dotenv").config();
const mongoose = require("mongoose");
const { GlobalSetting, FAQ } = require("../db");

const privacyPolicyContent = `
<h1>Privacy Policy</h1>
<p>Last updated: January 20, 2026</p>
<p>This Privacy Policy describes Our policies and procedures on the collection, use and disclosure of Your information when You use the Service and tells You about Your privacy rights and how the law protects You.</p>
<h2>Interpretation and Definitions</h2>
<h3>Interpretation</h3>
<p>The words of which the initial letter is capitalized have meanings defined under the following conditions. The following definitions shall have the same meaning regardless of whether they appear in singular or in plural.</p>
<h3>Definitions</h3>
<p>For the purposes of this Privacy Policy:</p>
<ul>
<li><strong>Account</strong> means a unique account created for You to access our Service or parts of our Service.</li>
<li><strong>Company</strong> (referred to as either "the Company", "We", "Us" or "Our" in this Agreement) refers to Bondy.</li>
<li><strong>Service</strong> refers to the Website.</li>
</ul>
`;

const termsConditionsContent = `
<h1>Terms and Conditions</h1>
<p>Last updated: January 20, 2026</p>
<p>Please read these terms and conditions carefully before using Our Service.</p>
<h2>Interpretation and Definitions</h2>
<h3>Interpretation</h3>
<p>The words of which the initial letter is capitalized have meanings defined under the following conditions. The following definitions shall have the same meaning regardless of whether they appear in singular or in plural.</p>
<h2>Acknowledgment</h2>
<p>These are the Terms and Conditions governing the use of this Service and the agreement that operates between You and the Company.</p>
`;

const faqs = [
    {
        question: "How do I create an account?",
        answer: "To create an account, click on the 'Sign Up' button on the top right corner and follow the instructions.",
        order: 1,
    },
    {
        question: "How can I reset my password?",
        answer: "You can reset your password by clicking on 'Forgot Password' on the login page.",
        order: 2,
    },
    {
        question: "Is there a mobile app available?",
        answer: "Yes, our mobile app is available for both iOS and Android devices.",
        order: 3,
    },
    {
        question: "How do I contact support?",
        answer: "You can contact support by emailing support@bondy.com or using the contact form on our website.",
        order: 4,
    },
    {
        question: "Can I cancel my subscription?",
        answer: "Yes, you can cancel your subscription at any time from your account settings.",
        order: 5,
    },
];

const seedContent = async () => {
    try {
        await mongoose.connect(process.env.DB_STRING);
        console.log("Connected to DB for seeding content...");

        // Seed Global Settings
        await GlobalSetting.findOneAndUpdate(
            { key: "privacy_policy" },
            {
                value: privacyPolicyContent,
                description: "HTML content for Privacy Policy page"
            },
            { upsert: true, new: true }
        );
        console.log("Privacy Policy seeded.");

        await GlobalSetting.findOneAndUpdate(
            { key: "terms_conditions" },
            {
                value: termsConditionsContent,
                description: "HTML content for Terms and Conditions page"
            },
            { upsert: true, new: true }
        );
        console.log("Terms and Conditions seeded.");

        // Seed FAQs
        await FAQ.deleteMany({}); // Clear existing FAQs to avoid duplicates on re-run or just insert. Let's clear for clean state.
        await FAQ.insertMany(faqs);
        console.log("FAQs seeded.");

        console.log("All content seeded successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding content:", error);
        process.exit(1);
    }
};

seedContent();

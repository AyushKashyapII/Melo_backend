import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS, 
  },
});
function generateOTP() {
  const otp = Math.floor(100000 + Math.random() * 900000);
  return otp;
}

const sendOTP = async (email, otp) => {
  await transporter.sendMail({
    from: `"TuneTribe Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Reset OTP",
    text: `Your OTP is ${otp}. It is valid for 5 minutes.`,
  });
};

export { sendOTP };

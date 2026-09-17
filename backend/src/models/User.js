import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // `select: false` so a stray `User.find()` can never leak hashes into
    // a response — callers that genuinely need it (login) opt in with
    // .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, default: null, trim: true },
    role: { type: String, enum: ['customer', 'staff', 'admin'], default: 'customer' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);

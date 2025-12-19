import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({

  uid: {
    type: String,
    required: [true, 'UID tidak boleh kosong'],
    unique: true,
    trim: true
  },

  name: { 
    type: String, 
    required: [true, 'Nama siswa tidak boleh kosong.'], 
    trim: true 
  },

  studentId: { 
    type: String, 
    required: [true, 'ID Siswa tidak boleh kosong.'], 
    unique: true, 
    trim: true 
  },

  gender: {
    type: String,
    required: [true, 'Jenis kelamin tidak boleh kosong.'],
    enum: ['Laki-laki', 'Perempuan']
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

});

export default mongoose.model.Student || mongoose.model('Student', studentSchema);
import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({

  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },

  timestamp: {
    type: Date,
    required: true,
  },

   status: {
    type: String,
    enum: ['HADIR', 'IZIN', 'SAKIT', 'ALFA'], 
    required: true
  },
  photoUrl: { 
    type: String, 
    default: null 
  },
  keterangan: {
    type: String,
    trim: true,
    default: ''
  }  
});

export default mongoose.model.Attendance || mongoose.model('Attendance', attendanceSchema);
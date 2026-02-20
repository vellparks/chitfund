import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function CustomerRegistrationForm({ onComplete, initialData, onCancel }) {
  const isEdit = !!initialData;
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    aadhaar_no: '',
    pan_no: '',
    photo: '',
    languages: 'English',
    name_tamil: '',
    address_tamil: ''
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        phone: initialData.phone || '',
        address: initialData.address || '',
        aadhaar_no: initialData.aadhaar_no || '',
        pan_no: initialData.pan_no || '',
        photo: initialData.photo || '',
        languages: initialData.languages || 'English',
        name_tamil: initialData.name_tamil || '',
        address_tamil: initialData.address_tamil || ''
      });
    }
  }, [initialData]);

  const [message, setMessage] = useState({ type: '', text: '' });
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const sanitizePhoneInput = (v) => (v || '').replace(/\D/g, '').slice(0, 10);
  const sanitizeAadhaarInput = (v) => (v || '').replace(/\D/g, '').slice(0, 12);
  const sanitizePANInput = (v) => {
    const up = (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    let out = '';
    for (let i = 0; i < up.length && out.length < 10; i++) {
      const ch = up[i];
      const pos = out.length;
      if (pos <= 4) {
        if (/[A-Z]/.test(ch)) out += ch;
      } else if (pos <= 8) {
        if (/[0-9]/.test(ch)) out += ch;
      } else if (pos === 9) {
        if (/[A-Z]/.test(ch)) out += ch;
      }
    }
    return out;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setFormData({ ...formData, phone: sanitizePhoneInput(value) });
    } else if (name === 'aadhaar_no') {
      setFormData({ ...formData, aadhaar_no: sanitizeAadhaarInput(value) });
    } else if (name === 'pan_no') {
      setFormData({ ...formData, pan_no: sanitizePANInput(value) });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photo: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setMessage({ type: 'error', text: 'கேமராவை அணுக முடியவில்லை.' });
    }
  };

  const capturePhoto = () => {
    const context = canvasRef.current.getContext('2d');
    context.drawImage(videoRef.current, 0, 0, 320, 240);
    const imageData = canvasRef.current.toDataURL('image/png');
    setFormData({ ...formData, photo: imageData });
    stopCamera();
  };

  const stopCamera = () => {
    const stream = videoRef.current.srcObject;
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const normalizePhone = (p) => {
        const digits = (p || '').replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return `+91${digits.slice(2)}`;
        if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
        return null;
      };
      const validateAadhaar = (a) => {
        if (!a) return true;
        const digits = a.replace(/\D/g, '');
        return /^\d{12}$/.test(digits);
      };
      const validatePAN = (p) => {
        if (!p) return true;
        const up = p.toUpperCase().trim();
        return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(up);
      };

      const normalizedPhone = normalizePhone(formData.phone);
      if (!normalizedPhone) {
        setMessage({ type: 'error', text: 'செல்போன் எண் +91XXXXXXXXXX வடிவில் இருக்க வேண்டும்.' });
        return;
      }
      if (!validateAadhaar(formData.aadhaar_no)) {
        setMessage({ type: 'error', text: 'ஆதார் எண் 12 இலக்கங்கள் மட்டும் இருக்க வேண்டும்.' });
        return;
      }
      if (!validatePAN(formData.pan_no)) {
        setMessage({ type: 'error', text: 'PAN எண் வடிவம் ABCDE1234F போல இருக்க வேண்டும்.' });
        return;
      }
      const payload = {
        ...formData,
        phone: normalizedPhone,
        aadhaar_no: (formData.aadhaar_no || '').replace(/\D/g, ''),
        pan_no: (formData.pan_no || '').toUpperCase().trim()
      };
      if (isEdit) {
        await axios.put(`http://localhost:9000/customers/${initialData.id}`, payload);
        setMessage({ type: 'success', text: 'வாடிக்கையாளர் விவரங்கள் புதுப்பிக்கப்பட்டது!' });
      } else {
        await axios.post('http://localhost:9000/customers/', payload);
        setMessage({ type: 'success', text: 'வாடிக்கையாளர் வெற்றிகரமாக பதிவு செய்யப்பட்டார்!' });
      }
      
      if (!isEdit) {
        setFormData({ 
          name: '', 
          phone: '', 
          address: '', 
          aadhaar_no: '', 
          pan_no: '', 
          photo: '',
          languages: 'English',
          name_tamil: '',
          address_tamil: ''
        });
      }
      
      if (onComplete) {
        setTimeout(() => {
          onComplete();
        }, 1500);
      }
    } catch (error) {
      setMessage({ type: 'error', text: isEdit ? 'விவரங்களை மாற்றுவதில் பிழை ஏற்பட்டது.' : 'பதிவு செய்வதில் பிழை ஏற்பட்டது.' });
      console.error('Error:', error);
    }
  };

  const handleLanguageToggle = (lang) => {
    let currentLangs = formData.languages.split(',').filter(l => l.trim() !== '');
    if (currentLangs.includes(lang)) {
      // Remove language
      currentLangs = currentLangs.filter(l => l !== lang);
    } else {
      // Add language
      currentLangs.push(lang);
    }
    
    // Ensure at least one language is selected (default to English if empty)
    if (currentLangs.length === 0) {
      currentLangs = ['English'];
    }
    
    setFormData({ ...formData, languages: currentLangs.join(',') });
  };

  const indianLanguages = [
    'Tamil', 'Hindi', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi'
  ];

  return (
    <div className="card" style={{ borderTop: `4px solid ${isEdit ? '#3b82f6' : '#10b981'}` }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        {isEdit ? 'Edit Customer Details (வாடிக்கையாளர் விவரங்களை மாற்றுக)' : 'Register New Customer (வாடிக்கையாளர் பதிவு)'}
      </h2>
      {message.text && (
        <div style={{ 
          padding: '1rem', 
          marginBottom: '1.5rem', 
          borderRadius: '8px',
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
          textAlign: 'center',
          fontSize: '0.9rem'
        }}>
          {message.text}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
          <label style={{ fontWeight: 'bold', marginBottom: '0.75rem', display: 'block' }}>Select Languages (மொழிகளைத் தேர்ந்தெடுக்கவும்)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {['English', ...indianLanguages].map(lang => (
              <div 
                key={lang}
                onClick={() => handleLanguageToggle(lang)}
                style={{ 
                  padding: '0.5rem 1rem', 
                  borderRadius: '20px', 
                  backgroundColor: formData.languages.includes(lang) ? '#10b981' : '#e2e8f0', 
                  color: formData.languages.includes(lang) ? 'white' : '#64748b', 
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: formData.languages.includes(lang) ? '1px solid #059669' : '1px solid #cbd5e1'
                }}
              >
                {lang} {formData.languages.includes(lang) && '✅'}
              </div>
            ))}
          </div>
        </div>

        <div className="form-grid" style={{ marginBottom: '1.25rem' }}>
          <div className="form-field">
            <label>Full Name (முழு பெயர் - English)</label>
            <input type="text" name="name" value={formData.name} onChange={handleInputChange} required placeholder="Enter customer's full name" />
          </div>
          {formData.languages.includes('Tamil') && (
            <div className="form-field">
              <label>பெயர் (தமிழ்)</label>
              <input type="text" name="name_tamil" value={formData.name_tamil} onChange={handleInputChange} placeholder="பெயரை தமிழில் உள்ளிடவும்" />
            </div>
          )}
          <div className="form-field">
            <label>Phone Number (செல்போன் எண்)</label>
            <input type="text" inputMode="numeric" maxLength={10} pattern="\d{10}" name="phone" value={formData.phone} onChange={handleInputChange} required placeholder="10 digit mobile" />
          </div>
        </div>

        <div className="form-grid" style={{ marginBottom: '1.25rem' }}>
          <div className="form-field">
            <label>Aadhaar Number (ஆதார்)</label>
            <input type="text" inputMode="numeric" maxLength={12} pattern="\d{12}" name="aadhaar_no" value={formData.aadhaar_no} onChange={handleInputChange} placeholder="12 digit number" />
          </div>
          <div className="form-field">
            <label>PAN Number (பான்)</label>
            <input type="text" maxLength={10} name="pan_no" value={formData.pan_no} onChange={handleInputChange} placeholder="ABCDE1234F" />
          </div>
        </div>

        <div className="form-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="form-field">
            <label>Address (English)</label>
            <textarea name="address" value={formData.address} onChange={handleInputChange} rows="2" placeholder="Enter residential address"></textarea>
          </div>
          {formData.languages.includes('Tamil') && (
            <div className="form-field">
              <label>முகவரி (தமிழ்)</label>
              <textarea name="address_tamil" value={formData.address_tamil} onChange={handleInputChange} rows="2" placeholder="முகவரியை தமிழில் உள்ளிடவும்"></textarea>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label>KYC Photo (புகைப்படம்)</label>
          <div style={{ marginTop: '0.75rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ fontSize: '0.8rem', width: 'auto' }} />
              <button type="button" onClick={startCamera} style={{ padding: '0.5rem 1rem', backgroundColor: '#64748b', fontSize: '0.85rem', width: 'auto' }}>
                📷 Use Camera
              </button>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-start' }}>
              {formData.photo ? (
                <img src={formData.photo} alt="KYC Preview" style={{ width: '140px', height: '140px', objectFit: 'cover', borderRadius: '12px', border: '3px solid white', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              ) : (
                <div style={{ width: '140px', height: '140px', borderRadius: '12px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>👤</div>
              )}
            </div>
          </div>

          {showCamera && (
            <div style={{ textAlign: 'center', background: '#0f172a', padding: '1.5rem', borderRadius: '12px', marginTop: '1rem' }}>
              <video ref={videoRef} autoPlay width="320" height="240" style={{ borderRadius: '8px', border: '2px solid #334155', maxWidth: '100%' }}></video>
              <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                <button type="button" onClick={capturePhoto} style={{ backgroundColor: '#10b981', width: 'auto', padding: '0.6rem 1.5rem' }}>Capture</button>
                <button type="button" onClick={stopCamera} style={{ backgroundColor: '#ef4444', width: 'auto', padding: '0.6rem 1.5rem' }}>Cancel</button>
              </div>
              <canvas ref={canvasRef} width="320" height="240" style={{ display: 'none' }}></canvas>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" style={{ padding: '1rem', flex: 2, fontWeight: 'bold', backgroundColor: isEdit ? '#3b82f6' : '#10b981' }}>
            {isEdit ? 'Update Customer (புதுப்பிக்கவும்)' : 'Register Customer Now'}
          </button>
          {isEdit && (
            <button type="button" onClick={onCancel} style={{ padding: '1rem', flex: 1, fontWeight: 'bold', backgroundColor: '#64748b' }}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default CustomerRegistrationForm;

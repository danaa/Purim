import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Wand2, Download, RefreshCw, Sparkles, Paintbrush, ArrowLeft, Camera, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const COSTUMES = [
  { id: 'pikachu', label: 'פיקאצ\'ו', prompt: 'Pikachu' },
  { id: 'stitch', label: 'סטיץ\'', prompt: 'Stitch from Lilo & Stitch' },
  { id: 'capybara', label: 'קפיברה', prompt: 'Capybara' },
  { id: 'superhero', label: 'גיבור/ת על', prompt: 'Superhero' },
  { id: 'royal', label: 'נסיכ/ה', prompt: 'royal princess or prince' },
  { id: 'custom', label: 'משהו אחר...', prompt: '' },
];

const LOADING_MESSAGES = [
  "מכינים את הצבעים...",
  "מודדים את התחפושת...",
  "מוסיפים קצת קסם של פורים...",
  "מפזרים אוזני המן ורעשנים...",
  "עוד רגע וזה מוכן!..."
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

const addTextToImage = (imageUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      
      // A4 dimensions at 300 DPI: 2480 x 3508 pixels
      // We will scale the generated image to fit within this, leaving space for text.
      const A4_WIDTH = 2480;
      const A4_HEIGHT = 3508;
      
      canvas.width = A4_WIDTH;
      canvas.height = A4_HEIGHT;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageUrl);
        return;
      }

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate image placement
      // We want the image to take up most of the page, but leave room for header/footer
      const headerHeight = 400;
      const footerHeight = 400;
      const availableHeight = A4_HEIGHT - headerHeight - footerHeight;
      
      // Scale image to fit available area while maintaining aspect ratio
      const scale = Math.min(A4_WIDTH / img.width, availableHeight / img.height);
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      const drawX = (A4_WIDTH - drawWidth) / 2;
      const drawY = headerHeight + (availableHeight - drawHeight) / 2;

      // Draw image with grayscale and contrast filter to ensure B&W coloring page look
      // This fixes issues where the model might generate colored images
      ctx.filter = 'grayscale(100%) contrast(150%) brightness(105%)';
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      ctx.filter = 'none'; // Reset filter for text

      // Text Configuration
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Helper for outlined text (coloring book style)
      const drawOutlinedText = (text: string, x: number, y: number, fontSize: number) => {
        // Use a more "fun" font style if possible, or just very bold Assistant
        ctx.font = `900 ${fontSize}px Assistant, sans-serif`;
        ctx.lineWidth = 12; // Much thicker outline for a "designed" look
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#ffffff';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        
        // Draw shadow/offset for a 3D effect that's still B&W
        ctx.strokeText(text, x + 5, y + 5);
        
        // Main outline
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y); 
      };

      // Top Text - Larger and more prominent
      drawOutlinedText('בפורים הזה כולנו יחד', A4_WIDTH / 2, headerHeight / 2, 180);

      // Bottom Text - Larger and more prominent
      drawOutlinedText('עם ישראל חי', A4_WIDTH / 2, A4_HEIGHT - footerHeight / 2 - 40, 240);

      // Add credit line - slightly smaller to not distract
      ctx.font = '600 35px Assistant, sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText('GenAiCreative.art נוצר באהבה באתר', A4_WIDTH / 2, A4_HEIGHT - 60);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};

export default function App() {
  const [step, setStep] = useState<'upload' | 'loading' | 'result'>('upload');
  const [hasKey, setHasKey] = useState<boolean>(true);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [gender, setGender] = useState<'boy' | 'girl'>('boy');
  const [age, setAge] = useState<string>('5');
  const [costume, setCostume] = useState<string>('pikachu');
  const [customCostume, setCustomCostume] = useState<string>('');
  
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loadingMessageIdx, setLoadingMessageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isFacebookBrowser, setIsFacebookBrowser] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [quotaReached, setQuotaReached] = useState(false);
  const [promptToCopy, setPromptToCopy] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isFB = ua.indexOf("FBAN") > -1 || ua.indexOf("FBAV") > -1 || ua.indexOf("Messenger") > -1 || ua.indexOf("Instagram") > -1;
    setIsFacebookBrowser(isFB);
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenInBrowser = () => {
    const url = window.location.href;
    
    // Attempt to force open in external browser
    if (/android/i.test(navigator.userAgent)) {
      // Android Intent
      const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intentUrl;
    } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // iOS - No perfect way, but we can try common schemes or just tell them to use the menu
      // Some versions of FB browser support this trick:
      window.location.href = url.includes('?') ? `${url}&open_external_browser=1` : `${url}?open_external_browser=1`;
    } else {
      window.open(url, '_blank');
    }
    
    // Also hide the overlay so they can continue if it didn't work
    setIsFacebookBrowser(false);
  };

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      const hasEnvKey = !!(envKey && envKey !== '');
      
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        try {
          // @ts-ignore
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasKey(selected || hasEnvKey);
        } catch (e) {
          setHasKey(hasEnvKey);
        }
      } else {
        setHasKey(hasEnvKey);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    setError(null);
  }, [customCostume, age, costume, imageFile]);

  const handleOpenKeySelector = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasKey(true);
      setError(null);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'loading') {
      interval = setInterval(() => {
        setLoadingMessageIdx((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [step]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  useEffect(() => {
    const selectedCostumeObj = COSTUMES.find(c => c.id === costume);
    const costumeName = costume === 'custom' ? customCostume : selectedCostumeObj?.label;
    const genderText = gender === 'boy' ? 'ילד' : 'ילדה';

    const prompt = `דף צביעה לילדים בשחור לבן בלבד (Line Art).
נושא: ${genderText} כבן/בת ${age} לבוש/ה בתחפושת ${costumeName}.
הדמות צריכה להיות גדולה ומרכזית, מחזיקה דגל ישראל.
רקע: אלמנטים של פורים כמו אוזני המן ורעשנים.
סגנון: קווי מתאר שחורים ברורים על רקע לבן נקי, ללא הצללות וללא צבעים.
חשוב: לשמור על תווי הפנים והתנוחה של הילד מהתמונה המקורית.`;

    setPromptToCopy(prompt);
  }, [costume, customCostume, age, gender]);

  const handleGenerate = async () => {
    if (!imageFile) {
      setError("אנא העלו תמונה תחילה");
      return;
    }
    if (costume === 'custom' && !customCostume.trim()) {
      setError("אנא כתבו למה תרצו להתחפש");
      return;
    }
    if (!age || isNaN(Number(age))) {
      setError("אנא הזינו גיל תקין");
      return;
    }

    setError(null);
    setQuotaReached(true);
    
    // Scroll to the message
    setTimeout(() => {
      const element = document.getElementById('quota-message');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const handleDownload = () => {
    if (resultImage) {
      const link = document.createElement('a');
      link.href = resultImage;
      link.download = 'purim-coloring-page.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const reset = () => {
    setStep('upload');
    setResultImage(null);
    setImageFile(null);
    setImagePreview(null);
    setCostume('pikachu');
    setCustomCostume('');
    setAge('5');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#FDF6E3] text-black font-['Assistant'] selection:bg-[#FF7F50]/30 flex flex-col" dir="rtl">
      
      {/* Facebook Browser Warning Overlay */}
      <AnimatePresence>
        {isFacebookBrowser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 max-w-md w-full text-center"
            >
              <div className="bg-[#FF7F50] w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-black">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-black mb-4">אופס! נראה שאתם בפייסבוק</h2>
              <p className="text-xl font-bold mb-8 leading-relaxed">
                כדי שהקסם יעבוד בצורה מושלמת והורדת התמונות תתאפשר, כדאי לפתוח את האתר בדפדפן הרגיל שלכם (כרום או ספארי).
              </p>
              <button 
                onClick={handleOpenInBrowser}
                className="w-full py-5 bg-blue-500 text-white border-2 border-black font-black text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center justify-center gap-3"
              >
                <RefreshCw className="w-8 h-8" />
                פתח בדפדפן הרגיל
              </button>

              <button 
                onClick={handleCopyLink}
                className="w-full mt-4 py-4 bg-white text-black border-2 border-black font-bold text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center justify-center gap-3"
              >
                {copySuccess ? "הקישור הועתק! ✅" : "העתק קישור והדבק בדפדפן"}
              </button>
              <button 
                onClick={() => setIsFacebookBrowser(false)}
                className="mt-6 text-gray-500 font-bold underline hover:text-black transition-colors"
              >
                המשך בכל זאת (לא מומלץ)
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="py-16 px-4 text-center border-b-[1.5px] border-black bg-[#FF7F50] text-white relative overflow-hidden">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">
            קסם של פורים: דפי צביעה אישיים 🥳✨
          </h1>
        </motion.div>
        <motion.p 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-xl md:text-2xl mt-8 font-bold bg-white text-black border-[1.5px] border-black inline-block px-8 py-3 transform -rotate-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          הופכים תמונה לדף צביעה קסום!
        </motion.p>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center px-4 pb-12 mt-12 md:mt-20">
        <AnimatePresence mode="wait">
          
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6 md:p-10"
            >
              <div className="space-y-12">
                
                {/* Image Upload */}
                <div className="space-y-6">
                  <label className="block text-2xl font-black uppercase tracking-tight">
                    1. העלו תמונה ברורה של הילד/ה 📸
                  </label>
                  <p className="text-sm font-bold text-gray-700 p-3 inline-block rounded-sm">
                    חשוב: תמונה עם תאורה טובה ופנים ברורות תיתן את התוצאה הכי טובה!
                  </p>
                  
                  <div className="flex justify-center">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-full max-w-md border-[1.5px] border-black p-10 text-center cursor-pointer transition-all hover:bg-[#FF7F50]/5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 ${imagePreview ? 'bg-[#FF7F50]/5' : 'bg-white'}`}
                    >
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleImageChange}
                      />
                      <div className="flex flex-col items-center">
                        <Upload className="w-16 h-16 mb-4 text-[#FF7F50]" />
                        <span className="font-black text-2xl">העלאת תמונה</span>
                      </div>
                    </div>
                  </div>

                  {imagePreview && (
                    <div className="mt-6 flex flex-col items-center border-[1.5px] border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <img src={imagePreview} alt="Preview" className="w-56 h-56 object-cover border-[1.5px] border-black mb-3" />
                      <p className="font-black text-lg text-[#FF7F50]">התמונה נבחרה בהצלחה!</p>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <label className="block text-2xl font-black uppercase tracking-tight">2. בן או בת? 👦👧</label>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setGender('boy')}
                        className={`flex-1 py-5 border-[1.5px] border-black font-black text-xl transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${gender === 'boy' ? 'bg-[#FF7F50] text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white hover:bg-[#FF7F50]/5'}`}
                      >
                        בן
                      </button>
                      <button
                        onClick={() => setGender('girl')}
                        className={`flex-1 py-5 border-[1.5px] border-black font-black text-xl transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${gender === 'girl' ? 'bg-[#FF7F50] text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white hover:bg-[#FF7F50]/5'}`}
                      >
                        בת
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-2xl font-black uppercase tracking-tight">3. גיל 🎂</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="120"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full bg-white border-[1.5px] border-black px-6 py-5 text-xl font-black focus:bg-[#FF7F50]/5 outline-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      placeholder="למשל: 5"
                    />
                  </div>
                </div>

                {/* Costume */}
                <div className="space-y-6">
                  <label className="block text-2xl font-black uppercase tracking-tight">4. למה תרצו להתחפש? 🦸‍♂️🧚‍♀️</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {COSTUMES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCostume(c.id)}
                        className={`py-5 border-[1.5px] border-black font-black transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${costume === c.id ? 'bg-[#FF7F50] text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white hover:bg-[#FF7F50]/5'}`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  
                  <AnimatePresence>
                    {costume === 'custom' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <input 
                          type="text" 
                          value={customCostume}
                          onChange={(e) => setCustomCostume(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                          className="w-full mt-6 bg-white border-[1.5px] border-black px-6 py-5 text-xl font-black focus:bg-[#FF7F50]/5 outline-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                          placeholder="כתבו כאן כל תחפושת..."
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-red-400 text-white border-[1.5px] border-black p-5 font-black text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-4"
                  >
                    <div className="flex-1">{error}</div>
                    {!hasKey && (
                      <button 
                        onClick={handleOpenKeySelector}
                        className="bg-white text-black border border-black px-4 py-1 font-black hover:bg-gray-100 transition-colors"
                      >
                        חיבור מפתח
                      </button>
                    )}
                  </motion.div>
                )}

                {!hasKey && !error && (
                  <div className="bg-cyan-400 border-[1.5px] border-black p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <p className="mb-2 font-black text-xl">כדי ליצור תמונות באיכות גבוהה, יש לחבר מפתח API מפרויקט בתשלום.</p>
                    <a 
                      href="https://ai.google.dev/gemini-api/docs/billing" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block mb-6 text-sm font-bold underline hover:text-white"
                    >
                      מידע על חיוב וחשבונות ב-Gemini API
                    </a>
                    <button 
                      onClick={handleOpenKeySelector}
                      className="bg-white border-[1.5px] border-black px-10 py-4 font-black text-2xl hover:bg-[#FF7F50] hover:text-white transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1"
                    >
                      חיבור מפתח API
                    </button>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  className="w-full py-8 border-[1.5px] border-black font-black text-3xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-4 bg-blue-500 hover:bg-blue-600 hover:translate-x-1 hover:translate-y-1 hover:shadow-none text-white active:bg-blue-700"
                >
                  <Wand2 className="w-12 h-12" />
                  צרו לי דף צביעה!
                </button>

                {/* Quota Reached Detailed Instructions */}
                <AnimatePresence>
                  {quotaReached && (
                    <motion.div 
                      id="quota-message"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-12 bg-[#FDF6E3] border-2 border-black p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    >
                      <div className="flex items-center gap-4 mb-6">
                        <div className="bg-[#FF7F50] p-3 rounded-full border-2 border-black">
                          <Sparkles className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-3xl font-black">וואו! איזו התרגשות! 🥳</h3>
                      </div>
                      
                      <p className="text-xl font-bold mb-6 leading-relaxed">
                        מעל <span className="text-[#FF7F50] font-black">1,500 דפי צביעה אישיים</span> כבר נוצרו בימים האחרונים והמכסה החינמית באפליקציה הגיעה לסיומה.
                      </p>
                      
                      <div className="space-y-6 text-lg font-bold">
                        <p>אבל אל דאגה, אתם עדיין יכולים ליצור את הקסם בעצמכם!</p>
                        <p className="text-blue-600 font-black text-xl">יש קרדיטים חינם להתנסות באתר שלנו! 🎁</p>
                        
                        <div className="bg-white border-2 border-black p-6 space-y-4">
                          <p className="font-black text-xl text-blue-600">איך עושים את זה?</p>
                          <ol className="list-decimal list-inside space-y-3">
                            <li>היכנסו לאתר שלנו: <a href="https://genaicreative.art" target="_blank" rel="noopener noreferrer" className="text-[#FF7F50] underline">GenAiCreative.art</a></li>
                            <li>העלו תמונה ברורה של הילד או הילדה.</li>
                            <li>העתיקו את ה"פרומפט" (הוראת היצירה) שמופיע כאן למטה.</li>
                            <li>הדביקו אותו באתר שלנו וצרו את הדף!</li>
                          </ol>
                        </div>

                        <div className="space-y-3">
                          <p className="font-black">הפרומפט שלכם (מתעדכן לפי הבחירות שלכם):</p>
                          <div className="space-y-4">
                            <textarea 
                              readOnly
                              value={promptToCopy}
                              className="w-full h-40 p-4 bg-gray-50 border-2 border-black font-bold text-lg resize-none"
                            />
                            <button 
                              onClick={handleCopyPrompt}
                              className="w-full bg-white border-2 border-black py-4 font-black text-xl hover:bg-[#FF7F50] hover:text-white transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 flex items-center justify-center gap-3"
                            >
                              {copySuccess ? "הועתק בהצלחה! ✅" : "העתקת הפרומפט"}
                            </button>
                          </div>
                          <p className="text-sm text-gray-600 italic">
                            * טיפ: אתם יכולים לשנות את המילה של התחפושת בתוך הפרומפט לכל מה שתרצו!
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </motion.div>
          )}

          {step === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md bg-white border-[1.5px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-12 text-center flex flex-col items-center justify-center min-h-[450px]"
            >
              <div className="relative w-40 h-40 mb-10">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-[4px] border-black border-t-[#FF7F50] rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-16 h-16 text-[#FF7F50]" />
                </div>
              </div>
              <h2 className="text-4xl font-black mb-6 uppercase tracking-tight">יוצרים קסם...</h2>
              <p className="text-xl font-bold px-6 py-3 inline-block">
                {LOADING_MESSAGES[loadingMessageIdx]}
              </p>
              <p className="mt-6 text-lg font-bold text-blue-600 animate-pulse">
                התהליך לוקח בערך דקה... שווה לחכות בסבלנות! ✨
              </p>
            </motion.div>
          )}

          {step === 'result' && resultImage && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-4xl flex flex-col items-center"
            >
              <div className="bg-white border-[1.5px] border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4 md:p-8 mb-10 w-full">
                <img 
                  src={resultImage} 
                  alt="Purim Coloring Page" 
                  className="w-full h-auto border-[1.5px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                />
              </div>

              <div className="flex flex-wrap justify-center gap-8 w-full">
                <button
                  onClick={handleDownload}
                  className="flex-1 min-w-[280px] bg-[#FF7F50] text-white border-[1.5px] border-black py-6 px-10 font-black text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center justify-center gap-4"
                >
                  <Download className="w-10 h-10" />
                  הורדה להדפסה (A4)
                </button>
                
                <button
                  onClick={reset}
                  className="flex-1 min-w-[280px] bg-white text-black border-[1.5px] border-black py-6 px-10 font-black text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center justify-center gap-4"
                >
                  <RefreshCw className="w-10 h-10" />
                  יצירת דף חדש
                </button>
              </div>
              
              <p className="mt-8 text-lg font-bold bg-white border border-black px-4 py-1 transform rotate-1">
                הדפיסו את הדף וצבעו בהנאה! חג פורים שמח! 🥳✨
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-12 px-4 text-center border-t-[1.5px] border-black bg-white">
        <p className="font-black text-xl mb-3">נוצר באהבה עבור ילדי ישראל 🇮🇱</p>
        <div className="flex flex-col items-center gap-2">
          <p className="font-bold text-lg">לעוד יצירה בבינה מלאכותית בעברית מלאה בואו לאתר שלנו:</p>
          <a 
            href="https://genaicreative.art" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block font-black text-[#FF7F50] hover:underline text-2xl"
          >
            GenAiCreative.art
          </a>
          <p className="mt-4 text-base font-medium">
            נבנה על ידי <a href="https://www.facebook.com/dana.akerman/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#FF7F50] transition-colors">דנה אקרמן גרין</a>
          </p>
        </div>
        <p className="text-sm font-bold mt-6 opacity-40">&copy; 2026 כל הזכויות שמורות</p>
      </footer>

    </div>
  );
}

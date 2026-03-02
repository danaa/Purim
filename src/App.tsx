import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Wand2, Download, RefreshCw, Sparkles, Paintbrush, ArrowLeft, Camera, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const COSTUMES = [
  { id: 'pikachu', label: 'פיקאצ\'ו', prompt: 'Pikachu' },
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setStep('loading');

    try {
      // Prioritize API_KEY from selector (required for 3.1 preview models), then GEMINI_API_KEY from secrets
      // @ts-ignore
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        // Try to trigger the key selector if we don't have a key at all
        // @ts-ignore
        if (window.aistudio) {
          setHasKey(false);
          throw new Error("יש לחבר את מפתח ה-API כדי להמשיך. לחצו על הכפתור שיופיע למטה.");
        }
        throw new Error("מפתח ה-API לא נמצא. אנא ודאו שהגדרתם אותו ב-Secrets או השתמשו בכפתור החיבור.");
      }

      const ai = new GoogleGenAI({ apiKey: apiKey as string });

      console.log("Starting image conversion...");
      const base64Data = await fileToBase64(imageFile);
      const mimeType = imageFile.type;
      console.log("Image converted to base64. MimeType:", mimeType);

      const selectedCostumeObj = COSTUMES.find(c => c.id === costume);
      const finalCostume = costume === 'custom' ? customCostume : selectedCostumeObj?.prompt;
      const genderText = gender === 'boy' ? 'boy' : 'girl';

      // Enhanced prompt for A4, B&W, and face/pose fidelity
      const prompt = `STRICTLY BLACK AND WHITE LINE ART. Coloring book page for children. 
      Subject: A ${age} year old ${genderText} wearing a ${finalCostume} costume. The character should be VERY LARGE and centered in the frame, filling at least 80% of the vertical space, and be HOLDING an Israeli flag (with clear outlines of the Star of David and stripes for coloring).
      Face and Pose: The face and the body pose MUST be an EXACT, IDENTICAL match to the person in the uploaded photo. Maintain the same facial features, eyes, nose, expression, and physical posture/pose perfectly. Only the clothing/costume should be changed to the specified costume.
      Body: Child proportions for a ${age} year old, but following the exact pose from the photo. 
      Background: Festive Purim elements scattered around the character, including Hamantaschen (Oznei Haman cookies) and traditional Purim Noisemakers (Raashanim). All elements must be clear, simple outlines for coloring.
      Style: Bold black outlines on a pure white background. NO colors, NO shading, NO grey tones, NO gradients, NO 3D effects. Only empty white spaces bounded by black lines.`;

      const requestContents = {
        parts: [
          {
            inlineData: {
              data: base64Data.split(',')[1],
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      };

      let response;
      const TIMEOUT_MS = 90000; // 1.5 minutes
      
      try {
        console.log("Attempting generation with gemini-3.1-flash-image-preview...");
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS)
        );

        response = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: requestContents,
            config: {
              imageConfig: {
                aspectRatio: "3:4",
                imageSize: "1K",
              }
            }
          }),
          timeoutPromise
        ]) as any;
        console.log("Successfully generated with gemini-3.1-flash-image-preview", response);
      } catch (err: any) {
        if (err.message === "TIMEOUT") {
          console.warn("gemini-3.1-flash-image-preview timed out after 90s. Falling back to gemini-2.5-flash-image...");
          try {
            response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: requestContents,
              config: {
                imageConfig: {
                  aspectRatio: "3:4",
                }
              }
            });
            console.log("Successfully generated with fallback gemini-2.5-flash-image", response);
          } catch (fallbackErr: any) {
            console.error("Fallback generation error with gemini-2.5-flash-image:", fallbackErr);
            throw fallbackErr;
          }
        } else {
          console.error("Generation error with gemini-3.1-flash-image-preview:", err);
          throw err;
        }
      }

      if (!response || !response.candidates || response.candidates.length === 0) {
        throw new Error("המודל לא החזיר תוצאה תקינה. נסו שוב.");
      }

      let generatedImageUrl = '';
      const parts = response.candidates[0].content.parts;
      for (const part of parts) {
        if (part.inlineData) {
          generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!generatedImageUrl) {
        // Check if there's text in the response (maybe a safety refusal)
        const textPart = parts.find(p => p.text);
        if (textPart) {
          console.warn("Model returned text instead of image:", textPart.text);
          throw new Error(`המודל סירב ליצור את התמונה: ${textPart.text}`);
        }
        throw new Error("לא נמצאה תמונה בתוצאה שהתקבלה. נסו שוב.");
      }

      console.log("Adding text overlay to generated image...");
      const finalImage = await addTextToImage(generatedImageUrl);
      console.log("Text overlay added successfully.");
      setResultImage(finalImage);
      setStep('result');

    } catch (err: any) {
      console.error("Generation error details:", err);
      let errorMessage = "אירעה שגיאה ביצירת התמונה. נסו שוב.";
      
      const errorText = err.message || "";
      const isQuotaExceeded = errorText.includes("RESOURCE_EXHAUSTED") || 
                             errorText.includes("Quota exceeded") || 
                             err.status === "RESOURCE_EXHAUSTED";

      if (isQuotaExceeded) {
        errorMessage = "בשל עומס רב על המערכת, המכסה היומית הסתיימה. ניתן יהיה ליצור דפי צביעה נוספים החל ממחר. תודה על הסבלנות!";
      } else if (errorText.includes("Requested entity was not found")) {
        errorMessage = "מפתח ה-API לא נמצא או לא תקין. אנא חברו מפתח חדש מפרויקט בתשלום.";
        setHasKey(false);
      } else if (errorText.includes("API key") || err.status === 401 || err.status === 403) {
        errorMessage = "בעיה במפתח ה-API. ודאו שהגדרתם את GEMINI_API_KEY ב-Secrets או השתמשו בכפתור החיבור.";
      } else if (errorText.includes("safety")) {
        errorMessage = "התמונה נחסמה על ידי מסנני הבטיחות. נסו תמונה אחרת.";
      } else if (errorText) {
        errorMessage = errorText;
      }
      
      setError(errorMessage);
      setStep('upload');
    }
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
                  disabled={!imageFile || (costume === 'custom' && !customCostume.trim()) || !age}
                  className={`w-full py-8 border-[1.5px] border-black font-black text-3xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-4 ${(!imageFile || (costume === 'custom' && !customCostume.trim()) || !age) ? 'bg-gray-300 cursor-not-allowed opacity-50' : 'bg-blue-500 hover:bg-blue-600 hover:translate-x-1 hover:translate-y-1 hover:shadow-none text-white active:bg-blue-700'}`}
                >
                  <Wand2 className="w-12 h-12" />
                  צרו לי דף צביעה!
                </button>

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
          <p className="font-bold text-lg">לעוד יצירה בבינה מלאכותית בואו לאתר:</p>
          <a 
            href="https://genaicreative.art" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block font-black text-[#FF7F50] hover:underline text-2xl"
          >
            GenAiCreative.art
          </a>
        </div>
        <p className="text-sm font-bold mt-6 opacity-40">&copy; 2026 כל הזכויות שמורות</p>
      </footer>

    </div>
  );
}

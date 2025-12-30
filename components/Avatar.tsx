
import React, { useMemo } from 'react';

interface AvatarProps {
  isSpeaking: boolean;
  volume?: number;
}

const Avatar: React.FC<AvatarProps> = ({ isSpeaking, volume = 0 }) => {
  // Mouth opening based on volume or state
  const mouthScale = isSpeaking ? 0.3 + (volume * 0.7) : 0.05;

  return (
    <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center">
      {/* Background Glow */}
      <div className={`absolute inset-0 rounded-full transition-all duration-500 blur-3xl ${isSpeaking ? 'bg-indigo-500/40' : 'bg-slate-500/10'}`} />
      
      {/* Main Character SVG (Stylized Cartoon Girl) */}
      <svg viewBox="0 0 200 200" className="w-full h-full relative z-10 animate-float">
        {/* Hair Back */}
        <path d="M50,80 Q30,120 50,160 Q100,180 150,160 Q170,120 150,80 Z" fill="#2D1B13" />
        
        {/* Face */}
        <ellipse cx="100" cy="100" rx="55" ry="60" fill="#FFE0BD" stroke="#C69E81" strokeWidth="2" />
        
        {/* Hair Front */}
        <path d="M45,80 Q70,40 100,50 Q130,40 155,80 L140,80 Q100,70 60,80 Z" fill="#4B2C20" />
        <path d="M45,80 Q35,110 40,140" fill="none" stroke="#4B2C20" strokeWidth="8" strokeLinecap="round" />
        <path d="M155,80 Q165,110 160,140" fill="none" stroke="#4B2C20" strokeWidth="8" strokeLinecap="round" />

        {/* Eyes */}
        <g transform="translate(0, -5)">
          <circle cx="75" cy="95" r="7" fill="white" />
          <circle cx="75" cy="95" r="4" fill="#6B4226" />
          <circle cx="77" cy="93" r="1.5" fill="white" />

          <circle cx="125" cy="95" r="7" fill="white" />
          <circle cx="125" cy="95" r="4" fill="#6B4226" />
          <circle cx="127" cy="93" r="1.5" fill="white" />
        </g>

        {/* Mouth */}
        <g transform={`translate(100, 125) scale(1, ${mouthScale})`}>
          <path 
            d="M-15,0 Q0,20 15,0" 
            fill={isSpeaking ? "#991B1B" : "none"} 
            stroke="#D14D4D" 
            strokeWidth="2" 
            strokeLinecap="round" 
          />
        </g>
        
        {/* Blush */}
        <circle cx="60" cy="115" r="5" fill="#FFB7B7" opacity="0.6" />
        <circle cx="140" cy="115" r="5" fill="#FFB7B7" opacity="0.6" />
      </svg>
      
      {/* Speech Rings */}
      {isSpeaking && (
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-full border-4 border-indigo-400/20 rounded-full animate-ping" />
        </div>
      )}
    </div>
  );
};

export default Avatar;

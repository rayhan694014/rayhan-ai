
export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export enum AppMode {
  CHAT = 'CHAT',
  LIVE = 'LIVE',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO'
}

export interface TranscriptionItem {
  role: 'user' | 'model';
  text: string;
}

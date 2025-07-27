export interface ColorModifier {
  enabled: boolean;
  color: string;
}

export interface Caption {
  id: number;
  speaker?: string;
  timestamp: string;
  text: string;
  outlineColor?: ColorModifier;
  fillColor?: ColorModifier;
}
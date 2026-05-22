/**
 * @description Declare event types for listening with listenTS() and dispatching with dispatchTS()
 */
export type EventTS = {
  myCustomEvent: {
    oneValue: string;
    anotherValue: number;
  };
};

export interface PropData {
  Name: string;
  IsTimeVarying: boolean;
  StartKeyframe: string;
  Keyframes: string;
  ParameterControlType: number;
}

export interface EffectData {
  name: string;
  matchName: string;
  props?: PropData[];
  _anchor?: {
    Type: number;
    AnchorInPoint: number;
    AnchorOutPoint: number;
  };
}

export interface PresetData {
  name: string;
  type: "video" | "audio";
  effects: EffectData[];
}

export interface AdvancedBlock {
  name: string;
  condition: "always" | "random" | "index" | "previous_preset";
  condition_value?: any;
  presets: string[]; // Names of presets to choose from
}

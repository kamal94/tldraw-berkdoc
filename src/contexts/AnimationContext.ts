import { createContext, useContext } from "react";

interface AnimationContextType {
  isAddLifeEnabled: boolean;
  setIsAddLifeEnabled: (value: boolean) => void;
}

export const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export function useAnimation() {
  const context = useContext(AnimationContext);
  if (context === undefined) {
    throw new Error("useAnimation must be used within an AnimationProvider");
  }
  return context;
}

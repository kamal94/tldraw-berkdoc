import { useState, type ReactNode } from "react";
import { AnimationContext } from "./AnimationContext";

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [isAddLifeEnabled, setIsAddLifeEnabled] = useState(true);

  return (
    <AnimationContext.Provider value={{ isAddLifeEnabled, setIsAddLifeEnabled }}>
      {children}
    </AnimationContext.Provider>
  );
}

import { createContext, useContext, useState, ReactNode } from "react";

interface AnimationContextType {
  isAliveMode: boolean;
  setIsAliveMode: (value: boolean) => void;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [isAliveMode, setIsAliveMode] = useState(true);

  return (
    <AnimationContext.Provider value={{ isAliveMode, setIsAliveMode }}>
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimation() {
  const context = useContext(AnimationContext);
  if (context === undefined) {
    throw new Error("useAnimation must be used within an AnimationProvider");
  }
  return context;
}


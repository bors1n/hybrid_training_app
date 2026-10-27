import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { ProfileSheet } from '../components/ProfileSheet.tsx';

interface ProfileCtx { open: () => void }
const Ctx = createContext<ProfileCtx>({ open: () => undefined });

export const useProfile = (): ProfileCtx => useContext(Ctx);

export function ProfileProvider({ children }: { children: ReactNode }): ReactElement {
  const [isOpen, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      {isOpen ? <ProfileSheet onClose={() => setOpen(false)} /> : null}
    </Ctx.Provider>
  );
}

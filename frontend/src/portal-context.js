import { createContext, useContext } from "react";

// Keep the provider identity stable when shared UI components refresh in Vite.
export const PortalContext = createContext(null);
export const usePortal = () => useContext(PortalContext);

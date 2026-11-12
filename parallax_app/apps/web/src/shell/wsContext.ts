// Kept in its own tiny module so a hot reload of the data code never creates a second context object.
import { createContext } from 'react';
import type { Region } from '../types';
import type { Core } from '../ui/useAppData';
import type { AppState } from '../state/store';

export interface Ws { core: Core; sel: AppState; region: Region | undefined; allYears: number[]; ready: boolean }
export const WsContext = createContext<Ws | null>(null);

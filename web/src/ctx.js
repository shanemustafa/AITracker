import { createContext, useContext } from 'react';

export const MetaCtx = createContext(null);
export const useMeta = () => useContext(MetaCtx);
export const ProjectCtx = createContext(null);
export const useProject = () => useContext(ProjectCtx);
export const UserCtx = createContext(null);
export const useUser = () => useContext(UserCtx);

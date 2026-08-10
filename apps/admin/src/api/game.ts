import http from '../utils/http';

export interface Game {
    id: string;
    name: string;
    key: string;
    description?: string;
    loginCallbackPath: string;
    domainWhitelist: string[];
    status: 'pending' | 'approved' | 'rejected' | 'decommissioned';
    decommissionReason?: string;
}

export interface RegisterGameParams {
    name: string;
    key: string;
    description?: string;
    loginCallbackPath: string;
    domainWhitelist: string[];
}

export const registerGame = (params: RegisterGameParams) => {
    return http.post<Game>('/games/register', params);
};

export interface GetGamesParams {
    searchValue?: string;
    status?: string;
}

export const getGames = (params?: GetGamesParams) => {
    return http.get<Game[]>('/games', { params });
};

export const getGameUsers = (gameKey: string) => {
    return http.get<any[]>(`/management/${gameKey}/users`);
};

export const updateGameConfig = (gameKey: string, config: { loginCallbackPath: string, domainWhitelist: string[] }) => {
    return http.post(`/management/${gameKey}/config`, config);
};

export const resubmitGame = (gameKey: string, params: { key?: string, loginCallbackPath?: string, domainWhitelist?: string[], name?: string, description?: string }) => {
    return http.post(`/management/${gameKey}/resubmit`, params);
};

export const getGameUserArchive = (gameKey: string, userId: string) => {
    return http.get<any>(`/management/${gameKey}/users/${userId}/archive`);
};

export const approveGame = (gameId: string) => {
    return http.post(`/admin/games/${gameId}/approve`);
};

export const decommissionGame = (gameId: string, reason: string) => {
    return http.post(`/admin/games/${gameId}/decommission`, { reason });
};

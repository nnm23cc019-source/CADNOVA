const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = {
  get: async (endpoint: string) => {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        return { error: `HTTP ${response.status}` };
      }
      return await response.json();
    } catch (err: any) {
      console.warn('API GET request warning:', err.message);
      return { error: err.message };
    }
  },

  post: async (endpoint: string, body: any) => {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return { error: `HTTP ${response.status}` };
      }
      return await response.json();
    } catch (err: any) {
      console.warn('API POST request warning:', err.message);
      return { error: err.message };
    }
  }
};

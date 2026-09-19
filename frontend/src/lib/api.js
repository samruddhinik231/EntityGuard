import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 10000,
  withCredentials: true
});

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://localhost:5443/api';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('hustlehub_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function toDisplayError(err) {
  if (err.response && err.response.data) {
    const { message, errors } = err.response.data;
    return {
      message: message || 'Something went wrong. Please try again.',
      fieldErrors: Array.isArray(errors) ? errors : [],
    };
  }
  if (err.request) {
    return { message: 'Could not reach the server. Please try again later.', fieldErrors: [] };
  }
  return { message: 'Something went wrong. Please try again.', fieldErrors: [] };
}

export { client, toDisplayError };

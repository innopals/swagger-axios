import { Spec } from "swagger-schema-official";
import { CodeGenConfig } from "../config";

export function generateAxiosInstance(
  spec: Spec,
  config: CodeGenConfig
): string {
  let responseInterceptor = "";
  if (config.resultDataField && config.resultErrorField) {
    responseInterceptor = `
instance.interceptors.response.use(
  (rs: any) => {
    const error = rs.${config.resultErrorField};
    const data = rs.${config.resultDataField};
    if (error) {
      throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
    }
    return data;
  },
  error => { throw error; }
);
  `;
  }
  let defaultBaseUrl = `${(spec.schemes || [])[0] || "http"}://${
    spec.host || "localhost"
  }${spec.basePath || ""}`;
  if (defaultBaseUrl.endsWith("/")) {
    defaultBaseUrl = defaultBaseUrl.substr(0, defaultBaseUrl.length - 1);
  }
  return `/* eslint-disable */
import axios from 'axios';

let authToken = "";
export function setAuthToken(token: string) {
  authToken = token;
}

const instance = axios.create({
  // @ts-ignore
  baseURL: process.env.API_BASE_URL || "${defaultBaseUrl}",
  timeout: 10000
});

instance.interceptors.request.use(
  (config) => {
    config.headers.Authorization = "Bearer " + authToken;
    return config;
  },
  // @ts-ignore
  error => Promise.reject(error),
);
${responseInterceptor}
export default instance;
`;
}

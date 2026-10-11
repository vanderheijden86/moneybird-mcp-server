import axios, { AxiosInstance } from 'axios';
import { MoneybirdReadOnlyError } from '../common/errors.js';

export const DEFAULT_BASE_URL = 'https://moneybird.com/api/v2';

export interface MoneybirdClientOptions {
  timeout?: number;
  baseURL?: string;
  // Every request passes through request(), so enforcing read-only there
  // covers the generic tool and any helper method alike.
  readOnly?: boolean;
}

export class MoneybirdClient {
  private client: AxiosInstance;
  private administrationId: string;
  readonly readOnly: boolean;

  constructor(apiToken: string, administrationId: string, options: MoneybirdClientOptions = {}) {
    const { timeout = 30000, baseURL = DEFAULT_BASE_URL, readOnly = false } = options;
    this.administrationId = administrationId;
    this.readOnly = readOnly;
    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: timeout
    });
  }

  // Financial Accounts
  async getFinancialAccounts() {
    return this.request('get', 'financial_accounts');
  }

  // Contacts
  async getContacts() {
    return this.request('get', 'contacts');
  }

  async getContact(id: string) {
    return this.request('get', `contacts/${id}`);
  }

  // Sales Invoices
  async getSalesInvoices() {
    return this.request('get', 'sales_invoices');
  }

  async getSalesInvoice(id: string) {
    return this.request('get', `sales_invoices/${id}`);
  }

  // Products
  async getProducts() {
    return this.request('get', 'products');
  }

  // Projects
  async getProjects() {
    return this.request('get', 'projects');
  }

  // Time entries
  async getTimeEntries() {
    return this.request('get', 'time_entries');
  }

  // Generic request method with retry logic
  async request(method: 'get' | 'post' | 'put' | 'delete', path: string, data?: any, retries = 2): Promise<any> {
    // Remove leading slash if present to avoid double slashes
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;

    if (this.readOnly && String(method).toLowerCase() !== 'get') {
      throw new MoneybirdReadOnlyError(method, normalizedPath);
    }

    try {
      console.error(`Attempting ${method.toUpperCase()} request to ${normalizedPath}`);
      const response = await this.client.request({
        method,
        url: `/${this.administrationId}/${normalizedPath}`,
        data
      });
      
      console.error(`Request to ${normalizedPath} completed successfully`);
      return response.data;
    } catch (error: any) {
      // Don't retry client errors (4xx) except for 429 (rate limit)
      const statusCode = error.response?.status;
      if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        console.error(`Client error (${statusCode}) for ${normalizedPath}, not retrying`);
        throw error;
      }
      
      if (retries > 0) {
        // Exponential backoff: 1000ms, 2000ms, 4000ms, etc.
        const delay = 1000 * Math.pow(2, 2 - retries);
        console.error(`Request to ${normalizedPath} failed, retrying in ${delay}ms... (${retries} attempts left)`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry the request with one less retry attempt
        return this.request(method, path, data, retries - 1);
      }
      
      console.error(`Request to ${normalizedPath} failed after all retry attempts`);
      throw error;
    }
  }
} 
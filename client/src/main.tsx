import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import '@/i18n';
import '@/styles/globals.css';
import { App } from '@/App';
import { Toaster, TooltipProvider } from '@/components/ui';
import { getErrorStatus } from '@/api/client';
import { installZodErrorMap } from '@/lib/validation';

installZodErrorMap();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      // Never retry auth / validation / not-found errors; retry flaky network once.
      retry: (count, err) => {
        const s = getErrorStatus(err);
        if (s && s >= 400 && s < 500) return false;
        return count < 1;
      },
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider>
            <App />
            <Toaster />
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);

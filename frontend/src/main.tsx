import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Auth0Provider } from '@auth0/auth0-react'
import './index.css'
import App from './App.tsx'
import AuthTokenBridge from './admin/AuthTokenBridge.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/admin`,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: 'openid profile email',
      }}
      useRefreshTokens
      cacheLocation="localstorage"
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthTokenBridge />
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Auth0Provider>
  </StrictMode>,
)

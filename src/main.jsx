import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LanguageProvider } from './i18n/LanguageContext'
import { AuthProvider } from './auth/AuthContext'
import { OfficeSettingsProvider } from './config/OfficeSettingsContext'
import { ServicesProvider } from './config/ServicesContext'
import App from './App'
import './index.css'
createRoot(document.getElementById('root')).render(
  <BrowserRouter><LanguageProvider><AuthProvider><OfficeSettingsProvider><ServicesProvider><App /></ServicesProvider></OfficeSettingsProvider></AuthProvider></LanguageProvider></BrowserRouter>
)

# Payment Gateway Integration (Stripe + Node.js)

This project is a full-stack payment gateway integration built with **Node.js**, **Express**, **PostgreSQL**, and the **Stripe API**. It provides a secure and efficient payment processing system with complete transaction tracking, refund management, analytics, and PDF receipt generation.

## Overview
The application enables users to make payments securely through Stripe while providing administrators full visibility into transaction data and revenue analytics. It supports role-based access control, real-time status verification via Stripe webhooks, and dynamic reporting features.

## Key Features
- **Stripe Payment Integration:** Secure checkout supporting test and live environments.
- **Transaction Logging:** All payment details are stored and managed in PostgreSQL.
- **Refund Management:** Admins can issue refunds directly from the dashboard.
- **Admin Authentication:** Protected routes secured with bcrypt-hashed admin keys.
- **Webhook Listener:** Automatically updates payment and refund statuses.
- **Analytics Dashboard:** Visual representation of transactions and revenue trends.
- **PDF Receipt Generation:** Downloadable payment receipts generated with PDFKit.
- **Render Deployment:** Fully deployed and hosted backend for live use.

## Technology Stack
**Backend:** Node.js, Express.js  
**Database:** PostgreSQL  
**Payment Gateway:** Stripe API  
**Authentication:** bcrypt.js  
**Frontend:** HTML, CSS, JavaScript  
**Visualization:** Chart.js  
**PDF Generation:** PDFKit  
**Hosting Platform:** Render  

## Local Setup

### 1. Clone the Repository
```bash
git clone https://github.com/MythNomad07/Payment-Gateway-Integration.git
cd Payment-Gateway-Integration/server

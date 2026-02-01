# AuditGuard - Compliance Intelligence Platform

## Overview

AuditGuard is an AI-powered audit comparison and scoring platform designed for compliance management. The application enables organizations to track field audit reports, score associate performance, validate audit decisions with AI, and compare reports across different auditors. It features role-based dashboards for administrators and field associates, with comprehensive metrics around report completeness, quality, and risk analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React Context for local state (AuthContext, AuditContext)
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Charts**: Recharts for data visualization
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **Session Management**: express-session with cookie-based auth
- **API Pattern**: RESTful JSON APIs under `/api/*` prefix
- **Development**: Vite dev server proxied through Express for HMR

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Validation**: Zod schemas generated via drizzle-zod
- **Database**: PostgreSQL (requires DATABASE_URL environment variable)

### Key Design Patterns
- **Monorepo Structure**: Client code in `client/`, server in `server/`, shared types in `shared/`
- **Path Aliases**: `@/*` maps to client/src, `@shared/*` maps to shared folder
- **Role-Based Access**: Admin users see aggregate dashboards, associates see personal performance
- **Report Scoring**: Multi-dimensional scoring (completeness, comprehensive, quality, overall) with AI validation of decisions

### Data Models
- **Users**: Associates with id, username, password, name, role, avatar
- **Reports**: Audit reports with metrics (field counts, photo validation, risk depth), scores, and AI-validated decisions

## External Dependencies

### Database
- PostgreSQL database (connection via DATABASE_URL environment variable)
- Drizzle Kit for schema migrations (`npm run db:push`)

### UI/Component Libraries
- Radix UI primitives (dialog, dropdown, tabs, etc.)
- shadcn/ui component system
- Lucide React icons
- Recharts for charts

### Development Tools
- Vite with React plugin
- Tailwind CSS v4 with @tailwindcss/vite
- Replit-specific plugins (runtime error overlay, cartographer, dev banner)

### Session/Auth
- express-session for session management
- Cookie-based authentication (no external auth provider)

### Deterministic Scoring System
- **Method**: Rule-based scoring using ApplicantSchema interface (no AI dependency)
- **Implementation**: `server/deterministic-scoring.ts` with `mapDraftToApplicant` and `scoreApplicant` functions
- **Total Points**: 100 (achievable only when ALL rubric items are satisfied)

**Scoring Categories (Excel Rubric Weights)**:
- Personal: 15pts (10 items at 1.5pts each)
- Business: 30pts (15 items at 2pts each, including sourceOfBusiness and comfortableEmi)
- Banking: 15pts (5 items at 3pts each)
- Networth: 10pts (4 items at 2.5pts each)
- Existing Debt: 10pts (4 items at 2.5pts each)
- End Use: 10pts (3 items totaling 10pts)
- Reference Checks: 10pts (3 items totaling 10pts)

**Field-to-Rubric Mapping** (all from independent data sources):
- Business: businessName, majorServices (nature), businessProfile (activity), strategicVision, promoterExperience, sourceOfBusiness, clientListConcentrationRisk, each from distinct form fields
- Debt: existingLoans (boolean|null - only awards points when explicitly documented), canServiceNewLoan scored in Business as comfortableEmi
- Personal: residenceOwned and monthlyRent are mutually exclusive (owned OR rented with documented rent)

**Key Principles**:
- No double counting: Each rubric item maps to exactly one data source
- Explicit documentation required: Missing/unknown values don't award points
- Deterministic: Same input always produces same score

**Full Coverage Matrix**: See `docs/SCORING_COVERAGE_MATRIX.md` for complete rubric-to-field mapping

## Recent Changes (December 2025)

### 100% Rubric Coverage Implementation
Extended the LIPDraftReport interface and form UI to support all 44+ rubric parameters:

**New Personal Fields**: selfEducation, spouseEducation, spouseEmployment, kidsEducation, kidsSchool, spouseName
**New Business Fields**: strategicVision, promoterExperience, clientListConcentrationRisk, seasonality, employeeCount, monthlyTurnover, majorClients, growthPlans
**New Banking Section**: bankName, turnoverCreditPercent, bankingTenure, emisRouted, qrCodeSpotted
**New Debt Section**: existingLoans, loanList, repaymentHistory
**New Property Fields**: propertiesOwned, vehiclesOwned, otherInvestments
**New End Use Fields**: agreementValue, advancePaid
**New Reference Fields**: invoiceVerified

### Scoring Logic Updates
- `deterministic-scoring.ts` now extracts values from nested draft locations using fallbacks (e.g., `draft.businessDetails?.comfortableEmi`)
- comfortableEmi scoring uses `debt.canServiceNewLoan` which maps to `draft.businessDetails.comfortableEmi`
- All new fields are properly initialized with empty strings in the default draft object
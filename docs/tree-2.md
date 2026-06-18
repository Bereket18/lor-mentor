# File Tree: lor-mentor

**Generated:** 6/15/2026, 2:16:03 PM
**Root Path:** `c:\Users\berek\Desktop\Lor-mentor\lor-mentor`

```
├── 📁 apps
│   ├── 📁 api
│   │   ├── 📁 prisma
│   │   │   ├── 📁 migrations
│   │   │   │   ├── 📁 20260611063236_init
│   │   │   │   │   └── 📄 migration.sql
│   │   │   │   └── ⚙️ migration_lock.toml
│   │   │   └── 📄 schema.prisma
│   │   ├── 📁 src
│   │   │   ├── 📁 common
│   │   │   │   ├── 📁 decorators
│   │   │   │   │   ├── 📄 current-user.decorator.ts
│   │   │   │   │   └── 📄 roles.decorator.ts
│   │   │   │   ├── 📁 guards
│   │   │   │   │   ├── 📄 jwt-auth.guard.ts
│   │   │   │   │   └── 📄 roles.guard.ts
│   │   │   │   └── 📁 strategies
│   │   │   │       └── 📄 jwt.strategy.ts
│   │   │   ├── 📁 modules
│   │   │   │   ├── 📁 auth
│   │   │   │   │   ├── 📁 dto
│   │   │   │   │   │   ├── 📄 login.dto.ts
│   │   │   │   │   │   └── 📄 register.dto.ts
│   │   │   │   │   ├── 📄 auth.controller.ts
│   │   │   │   │   ├── 📄 auth.module.ts
│   │   │   │   │   └── 📄 auth.service.ts
│   │   │   │   └── 📁 users
│   │   │   │       ├── 📄 users.controller.ts
│   │   │   │       ├── 📄 users.module.ts
│   │   │   │       └── 📄 users.service.ts
│   │   │   ├── 📁 prisma
│   │   │   │   ├── 📄 prisma.module.ts
│   │   │   │   └── 📄 prisma.service.ts
│   │   │   ├── 📄 app.controller.spec.ts
│   │   │   ├── 📄 app.controller.ts
│   │   │   ├── 📄 app.module.ts
│   │   │   ├── 📄 app.service.ts
│   │   │   └── 📄 main.ts
│   │   ├── 📁 test
│   │   │   ├── 📄 app.e2e-spec.ts
│   │   │   └── ⚙️ jest-e2e.json
│   │   ├── ⚙️ .gitignore
│   │   ├── ⚙️ .prettierrc
│   │   ├── 📝 README.md
│   │   ├── 📄 cookies.txt
│   │   ├── 📄 eslint.config.mjs
│   │   ├── ⚙️ nest-cli.json
│   │   ├── ⚙️ package.json
│   │   ├── 📄 prisma.config.ts
│   │   └── ⚙️ tsconfig.json
│   └── 📁 web
│       ├── 📁 apps
│       │   └── 📁 web
│       │       └── 📄 postcss.config.mjs
│       ├── 📁 public
│       │   ├── 🖼️ file.svg
│       │   ├── 🖼️ globe.svg
│       │   ├── 🖼️ next.svg
│       │   ├── 🖼️ vercel.svg
│       │   └── 🖼️ window.svg
│       ├── 📁 src
│       │   ├── 📁 app
│       │   │   ├── 📁 (app)
│       │   │   │   ├── 📁 dashboard
│       │   │   │   │   └── 📄 page.tsx
│       │   │   │   └── 📄 layout.tsx
│       │   │   ├── 📁 login
│       │   │   │   └── 📄 page.tsx
│       │   │   ├── 📁 register
│       │   │   │   └── 📄 page.tsx
│       │   │   ├── 📁 verify-email
│       │   │   │   └── 📄 page.tsx
│       │   │   ├── 📄 favicon.ico
│       │   │   ├── 🎨 globals.css
│       │   │   ├── 📄 layout.tsx
│       │   │   └── 📄 page.tsx
│       │   ├── 📁 components
│       │   │   ├── 📁 layout
│       │   │   │   ├── 📄 mobile-nav.tsx
│       │   │   │   ├── 📄 sidebar.tsx
│       │   │   │   └── 📄 topbar.tsx
│       │   │   └── 📁 ui
│       │   │       ├── 📄 avatar.tsx
│       │   │       ├── 📄 badge.tsx
│       │   │       ├── 📄 button.tsx
│       │   │       ├── 📄 card.tsx
│       │   │       ├── 📄 dialog.tsx
│       │   │       ├── 📄 dropdown-menu.tsx
│       │   │       ├── 📄 input.tsx
│       │   │       ├── 📄 label.tsx
│       │   │       └── 📄 separator.tsx
│       │   ├── 📁 hooks
│       │   │   └── 📄 use-auth.ts
│       │   ├── 📁 lib
│       │   │   ├── 📄 api.ts
│       │   │   └── 📄 utils.ts
│       │   └── 📁 types
│       │       └── 📄 index.ts
│       ├── ⚙️ .gitignore
│       ├── 📝 AGENTS.md
│       ├── 📝 CLAUDE.md
│       ├── 📝 README.md
│       ├── ⚙️ components.json
│       ├── 📄 eslint.config.mjs
│       ├── 📄 next-env.d.ts
│       ├── 📄 next.config.ts
│       ├── ⚙️ package.json
│       ├── 📄 postcss.config.mjs
│       ├── 📄 tailwind.config.ts
│       └── ⚙️ tsconfig.json
├── 📁 context
├── 📁 docs
│   ├── 📁 sprints
│   │   ├── 📝 sprint-0-complete.md
│   │   ├── 📝 sprint-1-complete.md
│   │   └── 📝 sprint-2-complete.md
│   └── 📝 File-tree.md
├── 📁 infrastructure
├── 📁 packages
│   └── 📁 shared
├── 📁 src
├── ⚙️ .env.example
├── ⚙️ .gitignore
├── 📝 README.md
├── ⚙️ package-lock.json
└── ⚙️ package.json
```

---
*Generated by FileTree Pro Extension*
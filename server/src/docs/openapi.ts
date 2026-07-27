/**
 * OpenAPI spec, hand-maintained.
 *
 * ponytail: a generator (zod-to-openapi) would keep this from drifting, at the
 * cost of decorating every schema. With ~20 endpoints, drift is cheaper than
 * the ceremony. Revisit if the surface doubles.
 */

const bearer = [{ bearerAuth: [] }]

const json = (schema: object) => ({ content: { 'application/json': { schema } } })
const ok = (description: string, schema: object = { type: 'object' }) => ({
  description,
  ...json(schema),
})

const paged = (itemsName: string) => ({
  type: 'object',
  properties: {
    [itemsName]: { type: 'array', items: { type: 'object' } },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pages: { type: 'integer' },
  },
})

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Local Lead Finder API',
    version: '1.0.0',
    description:
      'Finds local businesses via the Google Places API (New) and exports them as leads.\n\n' +
      '**Every search costs real money.** `POST /api/search/estimate` prices a search without ' +
      'calling Google — use it before `POST /api/search`.\n\n' +
      'Auth: `POST /api/auth/login` returns an access token. Send it as `Authorization: Bearer <token>`. ' +
      'The refresh token is set as an httpOnly cookie; call `POST /api/auth/refresh` when the access token expires.',
  },
  servers: [{ url: '/', description: 'This server' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Credentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string' },
        },
      },
      SearchInput: {
        type: 'object',
        description: 'Provide lat/lng, or at least one of city / state / country.',
        properties: {
          keyword: { type: 'string', example: 'vegan' },
          category: { type: 'string', example: 'cafe' },
          city: { type: 'string', example: 'Pune' },
          state: { type: 'string' },
          country: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
          radiusKm: { type: 'number', minimum: 1, maximum: 50, default: 5 },
          maxResults: { type: 'integer', minimum: 1, maximum: 60, default: 20 },
          tileRadiusKm: {
            type: 'number',
            description:
              'Tile the area to break Google\'s 60-result cap. Multiplies cost linearly with tile count.',
          },
          contactFields: {
            type: 'boolean',
            default: true,
            description: 'False drops phone/website/rating to reach a cheaper billing tier.',
          },
          filters: { $ref: '#/components/schemas/Filters' },
        },
      },
      Filters: {
        type: 'object',
        properties: {
          minRating: { type: 'number', minimum: 0, maximum: 5 },
          minReviews: { type: 'integer' },
          businessType: { type: 'string' },
          hasWebsite: { type: 'boolean' },
          hasPhone: { type: 'boolean' },
          openNow: { type: 'boolean' },
          maxDistanceKm: { type: 'number' },
        },
      },
      Cost: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['essentials', 'pro', 'enterprise', 'enterprisePlus'] },
          ratePer1000: { type: 'number' },
          tiles: { type: 'integer' },
          billableCalls: { type: 'integer' },
          maxResultCeiling: { type: 'integer' },
          totalCost: { type: 'number' },
          costPerLead: { type: 'number' },
        },
      },
      Business: {
        type: 'object',
        properties: {
          placeId: { type: 'string' },
          name: { type: 'string' },
          address: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          website: { type: 'string', nullable: true },
          rating: { type: 'number', nullable: true },
          reviews: { type: 'integer' },
          types: { type: 'array', items: { type: 'string' } },
          openingHours: { type: 'array', items: { type: 'string' }, nullable: true },
          openNow: { type: 'boolean', nullable: true },
          lat: { type: 'number', nullable: true },
          lng: { type: 'number', nullable: true },
          mapsUrl: { type: 'string', nullable: true },
          priceLevel: { type: 'string', nullable: true },
          status: { type: 'string', nullable: true },
          distanceKm: { type: 'number', nullable: true },
          leadScore: {
            type: 'integer',
            description: 'Opportunity rank. No website + many reviews scores highest.',
          },
          timesSeen: { type: 'integer' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' }, issues: { type: 'object' } },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Liveness and backend status',
        security: [],
        responses: { 200: ok('Service is up') },
      },
    },

    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account',
        security: [],
        requestBody: json({ $ref: '#/components/schemas/Credentials' }),
        responses: {
          201: ok('Registered; returns an access token'),
          409: ok('Email already registered', { $ref: '#/components/schemas/Error' }),
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in',
        security: [],
        requestBody: json({ $ref: '#/components/schemas/Credentials' }),
        responses: {
          200: ok('Access token plus the user'),
          401: ok('Incorrect email or password', { $ref: '#/components/schemas/Error' }),
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange the refresh cookie for a new access token',
        security: [],
        responses: { 200: ok('New access token'), 401: ok('Session expired') },
      },
    },
    '/api/auth/logout': {
      post: { tags: ['Auth'], summary: 'Clear the refresh cookie', security: [], responses: { 200: ok('Signed out') } },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user', security: bearer, responses: { 200: ok('The signed-in user') } },
    },

    '/api/search/estimate': {
      post: {
        tags: ['Search'],
        summary: 'Price a search without running it',
        description: 'Never calls Google. Safe to call on every keystroke.',
        security: bearer,
        requestBody: json({ $ref: '#/components/schemas/SearchInput' }),
        responses: { 200: ok('Cost breakdown', { $ref: '#/components/schemas/Cost' }) },
      },
    },
    '/api/search': {
      post: {
        tags: ['Search'],
        summary: 'Run a search (spends money)',
        description:
          'Counts against the daily quota. Results are merged into the lead ledger by place_id and ranked by lead score.',
        security: bearer,
        requestBody: json({ $ref: '#/components/schemas/SearchInput' }),
        responses: {
          200: ok('Businesses, cost and quota', {
            type: 'object',
            properties: {
              searchId: { type: 'string' },
              total: { type: 'integer' },
              tiles: { type: 'integer' },
              cached: { type: 'boolean' },
              cost: { $ref: '#/components/schemas/Cost' },
              businesses: { type: 'array', items: { $ref: '#/components/schemas/Business' } },
            },
          }),
          429: ok('Daily quota exhausted', { $ref: '#/components/schemas/Error' }),
        },
      },
    },
    '/api/search/history': {
      get: { tags: ['Search'], summary: 'Search history, saved pinned first', security: bearer, responses: { 200: ok('History') } },
    },
    '/api/search/history/{id}': {
      patch: {
        tags: ['Search'],
        summary: 'Save or unsave a search',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: json({ type: 'object', properties: { saved: { type: 'boolean' } } }),
        responses: { 200: ok('Updated'), 404: ok('Not found') },
      },
      delete: {
        tags: ['Search'],
        summary: 'Delete a history entry',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: ok('Deleted'), 404: ok('Not found') },
      },
    },
    '/api/search/usage': {
      get: { tags: ['Search'], summary: 'API usage and quota', security: bearer, responses: { 200: ok('Usage') } },
    },

    '/api/leads': {
      get: {
        tags: ['Leads'],
        summary: 'The lead ledger, deduped by place_id',
        security: bearer,
        parameters: [
          { name: 'saved', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'hasWebsite', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'minScore', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { 200: ok('Leads', paged('items')) },
      },
    },
    '/api/leads/save': {
      post: {
        tags: ['Leads'],
        summary: 'Bookmark or unbookmark leads',
        security: bearer,
        requestBody: json({
          type: 'object',
          required: ['placeIds'],
          properties: {
            placeIds: { type: 'array', items: { type: 'string' } },
            saved: { type: 'boolean', default: true },
            notes: { type: 'string' },
          },
        }),
        responses: { 200: ok('Counts of matched and modified') },
      },
    },
    '/api/leads/{placeId}': {
      delete: {
        tags: ['Leads'],
        summary: 'Remove a lead from the ledger',
        security: bearer,
        parameters: [{ name: 'placeId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: ok('Deleted'), 404: ok('Not found') },
      },
    },

    '/api/export': {
      post: {
        tags: ['Export'],
        summary: 'Export leads as CSV, XLSX or JSON',
        description: 'Streams the response. Logged to export history.',
        security: bearer,
        requestBody: json({
          type: 'object',
          required: ['format', 'businesses'],
          properties: {
            format: { type: 'string', enum: ['csv', 'xlsx', 'json'] },
            filename: { type: 'string', default: 'leads' },
            businesses: { type: 'array', items: { $ref: '#/components/schemas/Business' } },
          },
        }),
        responses: { 200: { description: 'The file', content: { 'application/octet-stream': {} } } },
      },
    },

    '/api/dashboard': {
      get: { tags: ['Dashboard'], summary: 'Totals, quota, recent searches and exports', security: bearer, responses: { 200: ok('Dashboard') } },
    },

    '/api/admin/users': {
      get: { tags: ['Admin'], summary: 'List users with today\'s usage', security: bearer, responses: { 200: ok('Users', paged('users')), 403: ok('Admin only') } },
    },
    '/api/admin/users/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Change plan, role, password, or disable a user',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: json({
          type: 'object',
          properties: {
            plan: { type: 'string', enum: ['free', 'pro', 'unlimited'] },
            role: { type: 'string', enum: ['user', 'admin'] },
            disabled: { type: 'boolean' },
            password: { type: 'string', minLength: 8 },
          },
        }),
        responses: { 200: ok('Updated user'), 400: ok('Cannot demote or disable yourself') },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Delete a user and everything they own',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: ok('Deleted') },
      },
    },
    '/api/admin/users/{id}/api-key': {
      put: {
        tags: ['Admin'],
        summary: 'Set or clear a user\'s own Google API key (write-only)',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: json({
          type: 'object',
          properties: { apiKey: { type: 'string', nullable: true } },
        }),
        responses: { 200: ok('Set') },
      },
    },
    '/api/admin/analytics': {
      get: {
        tags: ['Admin'],
        summary: 'Install-wide usage analytics',
        security: bearer,
        parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 30, maximum: 90 } }],
        responses: { 200: ok('Analytics') },
      },
    },
    '/api/admin/searches': {
      get: { tags: ['Admin'], summary: 'Search logs across all users', security: bearer, responses: { 200: ok('Logs', paged('items')) } },
    },
    '/api/admin/exports': {
      get: { tags: ['Admin'], summary: 'Export logs across all users', security: bearer, responses: { 200: ok('Logs') } },
    },
  },
} as const

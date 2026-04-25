import swaggerUi from 'swagger-ui-express';
import type { OpenAPI } from 'openapi-types';
import swaggerJSDoc from 'swagger-jsdoc';

const swaggerSpec = swaggerJSDoc({
  swaggerDefinition: {
    openapi: '3.0.3',
    info: {
      title: 'Hermes Client',
      version: '1.0.0',
      description: 'REST API for the Hermes Client web UI',
    },
    servers: [{ url: '/api' }],
    tags: [
      { name: 'auth' },
      { name: 'user' },
      { name: 'agent' },
      { name: 'conversation' },
      { name: 'message' },
      { name: 'cron' },
      { name: 'plugin' },
      { name: 'skill' },
      { name: 'update' },
    ],
  },
  apis: ['**/routes/**/doc.yaml'],
}) as OpenAPI.Document;

const swaggerConf = swaggerUi.setup(swaggerSpec);

export { swaggerConf, swaggerSpec };

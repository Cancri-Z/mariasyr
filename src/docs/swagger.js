const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Maria Fashion API',
      version: '1.0.0',
      description: 'Design App API Documentation'
    },
    servers: [{ url: 'http://localhost:4000' }]
  },
  apis: ['./src/routes/*.js'] // Path to your route files
};

const specs = swaggerJsDoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
};
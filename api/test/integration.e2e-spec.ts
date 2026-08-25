import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { DropiService } from './../src/modules/dropi/dropi.service';
import { AIService } from './../src/modules/ai/ai.service';

const TEST_EMAIL = `e2e-test-${Date.now()}@test.com`;
const TEST_PASS = 'Test1234!';

describe('Integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DropiService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        login: jest.fn(),
        createOrder: jest.fn().mockResolvedValue({ success: true, message: 'mocked' }),
        getStatus: jest.fn().mockResolvedValue({ connected: false, email: '' }),
        relogin: jest.fn(),
        forceRelogin: jest.fn(),
      })
      .overrideProvider(AIService)
      .useValue({
        chat: jest.fn().mockResolvedValue('Mock response'),
        generateProductDescription: jest.fn().mockResolvedValue('Description'),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
  }, 30000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
    http?.close();
    await app.close().catch(() => {});
  }, 20000);

  describe('Database connectivity', () => {
    it('GET /health returns ok with DB connected', async () => {
      const res = await request(http).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
    });

    it('GET / returns API message', async () => {
      const res = await request(http).get('/').expect(200);
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('Auth with real DB', () => {
    it('POST /auth/register creates user in DB', async () => {
      const res = await request(http)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASS, name: 'E2E Test' })
        .expect(201);

      expect(res.body).toHaveProperty('email', TEST_EMAIL);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');

      const dbUser = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
      expect(dbUser).not.toBeNull();
      expect(dbUser!.name).toBe('E2E Test');
      expect(dbUser!.role).toBe('CUSTOMER');
      expect(dbUser!.password).toBeTruthy();
    });

    it('POST /auth/register rejects duplicate email', async () => {
      await request(http)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASS, name: 'E2E Test 2' })
        .expect(400);
    });

    it('POST /auth/login succeeds with correct credentials', async () => {
      const res = await request(http)
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASS })
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(TEST_EMAIL);
      expect(res.body).not.toHaveProperty('access_token');
      expect(res.body).not.toHaveProperty('token');

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
    });

    it('POST /auth/login fails with wrong password', async () => {
      await request(http)
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: 'WrongPass123!' })
        .expect(401);
    });

    it('GET /auth/profile fails without auth cookie', async () => {
      await request(http)
        .get('/auth/profile')
        .expect(401);
    });
  });

  describe('Public catalog with real DB', () => {
    it('GET /products returns array with active flag', async () => {
      const res = await request(http).get('/products').expect(200);
      const items = Array.isArray(res.body) ? res.body : (res.body.items || []);
      expect(Array.isArray(items)).toBe(true);
      for (const item of items) {
        expect(item.active).toBe(true);
      }
    });

    it('GET /categories returns array', async () => {
      const res = await request(http).get('/categories').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /products/[slug] returns 404 for nonexistent slug', async () => {
      await request(http)
        .get('/products/nonexistent-slug-xyz')
        .expect(404);
    });
  });
});

const request = require("supertest");
const express = require("express");

const authRoutes = require("../routes/auth");

const app = express();
app.use(express.json());
app.use("/auth", authRoutes);

test("login works with seeded admin", async () => {
  const res = await request(app)
    .post("/auth/login")
    .send({ username: "admin", password: "admin123" });

  expect(res.statusCode).toBe(200);
  expect(res.body.token).toBeTruthy();
});

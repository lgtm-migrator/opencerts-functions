const supertest = require("supertest");
const { put, remove } = require("../../src/storage/s3");
const config = require("../../src/storage/config");
const ropstenDocument = require("../fixtures/certificate.json");

const API_ENDPOINT = "https://api-ropsten.opencerts.io";
const request = supertest(API_ENDPOINT);

const uuidV4Regex = new RegExp(
  /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i
);

const thatIsUploadResponse = {
  id: expect.stringMatching(uuidV4Regex),
  key: expect.any(String),
  type: expect.stringMatching("OPEN-ATTESTATION-TYPE-1")
};

const thatIsRetrievedDocument = {
  document: expect.objectContaining({
    cipherText: expect.any(String),
    iv: expect.any(String),
    tag: expect.any(String)
  })
};

describe("storage endpoint test", () => {
  let documentKey = "";
  afterEach(async () => {
    await remove({ Bucket: config.bucketName, Key: documentKey });
  });

  it("should create a new document when no placeholder object is there", async () => {
    await request
      .get("/storage/create")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .send({
        document: ropstenDocument
      })
      .expect(async res => {
        documentKey = res.body.id;
        expect(res.body).toEqual(thatIsUploadResponse);
      })
      .expect("Content-Type", /json/)
      .expect(200);
  }, 5000);

  it("should replace the placeholder object document with new data", async () => {
    const placeholderObj = { foo: "bar" };
    documentKey = "123";
    const params = {
      Bucket: config.bucketName,
      Key: documentKey,
      Body: JSON.stringify({ placeholderObj })
    };
    await put(params);
    await request
      .get("/storage/create")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .send({
        document: ropstenDocument,
        id: documentKey
      })
      .expect("Content-Type", /json/)
      .expect(200)
      .expect(async res => {
        expect(res.body.id).toEqual(documentKey);
        expect(res.body).toEqual(thatIsUploadResponse);
      });
  }, 5000);

  it("should retrieve the document created", async () => {
    documentKey = "123";
    await request
      .get("/storage/create")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .send({
        document: ropstenDocument,
        id: documentKey
      })
      .expect("Content-Type", /json/)
      .expect(200);

    await request
      .get(`/storage/get/${documentKey}`)
      .set("Content-Type", "application/json")
      .expect("Content-Type", /json/)
      .expect(200)
      .expect(async res => {
        expect(res.body).toEqual(thatIsRetrievedDocument);
      });
  }, 5000);

  it("should throw error forbidden when directly access the document", async () => {
    const document = { foo: "bar" };
    documentKey = "123";
    const params = {
      Bucket: config.bucketName,
      Key: documentKey,
      Body: JSON.stringify({ document })
    };

    const uploaded = await put(params);
    await supertest(`${uploaded.Location}`)
      .get("/")
      .set("Content-Type", "application/json")
      .expect("Content-Type", /json/)
      .expect(403);
  }, 5000);

  it("should create a placeholder object", async () => {
    await request
      .get("/storage/queue")
      .set("Content-Type", "application/json")
      .expect("Content-Type", /json/)
      .expect(200)
      .expect(res => {
        documentKey = res.body.queueNumber;
        expect(res.body).toEqual({
          queueNumber: expect.any(String),
          key: expect.any(String)
        });
      });

    await request
      .get(`/storage/get/${documentKey}`)
      .set("Content-Type", "application/json")
      .expect(400);

    await supertest(`https://${config.bucketName}.s3.amazonaws.com`)
      .get(`/${documentKey}`)
      .set("Content-Type", "application/json")
      .expect(403);
  }, 5000);
});

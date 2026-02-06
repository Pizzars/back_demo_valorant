const {onRequest} = require("firebase-functions/https");
const admin = require("firebase-admin");
// const logger = require("firebase-functions/logger");
const express = require("express");
const cors = require("cors");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({credential: admin.credential.cert(serviceAccount)});

const app = express();
app.use(cors({origin: true}));

const db = admin.firestore();

const validateRole = (requiredRole) => {
  return async (req, res, next) => {
    // 1. Reutilizamos la lógica del token (puedes separarla si prefieres)
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      return res.status(403).send('No autorizado: Falta el Token');
    }

    const idToken = req.headers.authorization.split('Bearer ')[1];

    try {
      // 2. Verificar el token
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedIdToken.uid;

      // 3. Consultar el documento del usuario en Firestore
      const userDoc = await db.collection("users").doc(uid).get();

      if (!userDoc.exists) {
        return res.status(404).send('Usuario no encontrado en la base de datos');
      }

      const userData = userDoc.data();
      req.user = { uid, ...userData }; // Guardamos nombre y rol en el request

      // 4. Lógica de permisos
      // Si el usuario es 'admin', pasa siempre. 
      // Si es 'viewer', solo pasa si el servicio requiere 'viewer'.
      if (userData.role === 'admin') {
        return next();
      } 
      
      if (userData.role === 'viewer' && requiredRole === 'viewer') {
        return next();
      }

      return res.status(403).send('Permisos insuficientes: Se requiere rol ' + requiredRole);

    } catch (error) {
      console.error('Error de autenticación/roles:', error);
      return res.status(403).send('Error de validación');
    }
  };
};

app.get("/hello", (req, res) => {
  return res
      .status(200)
      .send("Hello World from Express and Firebase Functions!");
});

app.get("/topics", validateRole('viewer'), async (req, res) => {
  (async () => {
    try {
      const topics = [];
      const query = db.collection("topics");
      await query.get().then((snapshot) => {
        const docs = snapshot.docs;
        for (const doc of docs) {
          const item = {id: doc.id, ...doc.data()};
          topics.push(item);
        }
      });

      return res.status(200).send(topics);
    } catch (error) {
      return res.status(500).send(error);
    }
  })();
});

app.post("/subtopics", validateRole('viewer'), async (req, res) => {
  (async () => {
    try {
      const topics = [];
      const query = db.collection(`topics/${req.body.topicId}/subtopics`);
      await query.get().then((snapshot) => {
        const docs = snapshot.docs;
        for (const doc of docs) {
          const item = {id: doc.id, ...doc.data()};
          topics.push(item);
        }
      });

      return res.status(200).send(topics);
    } catch (error) {
      return res.status(500).send(error);
    }
  })();
});

app.post("/update-detail", validateRole('admin'), async (req, res) => {
  (async () => {
    try {
      const {topicId, subtopicId, blocks} = req.body;

      let order = 0;

      const collectionRef = db.collection(
          `topics/${topicId}/subtopics/${subtopicId}/blocks`,
      );

      for (const block of blocks) {
        const idBlock = block.id;
        delete block.id;

        block.order = order;

        if (idBlock && idBlock.length > 0) {
          await collectionRef
              .doc(idBlock)
              .set(block, {merge: true});
        } else {
          await collectionRef.add(block);
        }

        order += 1;
      }

      return res.status(200).json({success: true});
    } catch (error) {
      return res.status(500).send(error);
    }
  })();
});

app.post("/subtopic-detail", validateRole('viewer'), async (req, res) => {
  (async () => {
    try {
      const topics = [];
      const query = db
          .collection(
              `topics/${
                req.body.topicId
              }/subtopics/${
                req.body.subtopicId
              }/blocks`,
          )
          .orderBy("order", "asc");
      await query.get().then((snapshot) => {
        const docs = snapshot.docs;
        for (const doc of docs) {
          const item = {id: doc.id, ...doc.data()};
          topics.push(item);
        }
      });

      return res.status(200).send(topics);
    } catch (error) {
      return res.status(500).send(error);
    }
  })();
});

app.post("/delete-block-detail", validateRole('admin'), async (req, res) => {
  (async () => {
    try {
      const collectionRef = db
          .collection(
              `topics/${
                req.body.topicId
              }/subtopics/${
                req.body.subtopicId
              }/blocks`,
          );

      const rs = await collectionRef.doc(req.body.blockId).delete();

      return res.status(200).send(rs);
    } catch (error) {
      return res.status(500).send(error);
    }
  })();
});

exports.app = onRequest(app);

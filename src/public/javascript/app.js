/* global firebase, firebaseui, Stripe */

/**
 * Replace with your publishable key from the Stripe Dashboard
 * https://dashboard.stripe.com/apikeys
 */
const STRIPE_PUBLISHABLE_KEY = "pk_live_gIrFRMmPWEyCaAjsqHpuo0ra";

/**
 * Your Firebase config from the Firebase console
 * https://firebase.google.com/docs/web/setup#config-object
 */
const firebaseConfig = {
  apiKey: "AIzaSyB4HCYbZ7bumCG22lrfj0IvUmK7TCWQ2UE",
  authDomain: "askrj-euejad.firebaseapp.com",
  databaseURL: "https://askrj-euejad.firebaseio.com",
  projectId: "askrj-euejad",
  storageBucket: "askrj-euejad.appspot.com",
  messagingSenderId: "528602578568",
  appId: "1:528602578568:web:669c591fa03285d4dda93d"
};

/**
 * Initialize Firebase
 */
const firebaseApp = firebase.initializeApp(firebaseConfig);
const db = firebaseApp.firestore();
let currentUser;

/**
 * Firebase Authentication configuration
 */
const firebaseUI = new firebaseui.auth.AuthUI(firebase.auth());
const firebaseUiConfig = {
  callbacks: {
    signInSuccessWithAuthResult: function (authResult, redirectUrl) {
      // User successfully signed in.
      // Return type determines whether we continue the redirect automatically
      // or whether we leave that to developer to handle.
      return true;
    },
    uiShown: () => {
      document.querySelector("#loader").style.display = "none";
    }
  },
  signInFlow: "popup",
  signInSuccessUrl: "/",
  signInOptions: [firebase.auth.PhoneAuthProvider.PROVIDER_ID],
  //signInOptions: [firebase.auth.EmailAuthProvider.PROVIDER_ID],
  credentialHelper: firebaseui.auth.CredentialHelper.NONE,
  // Your terms of service url.
  tosUrl: "https://example.com/terms",
  // Your privacy policy url.
  privacyPolicyUrl: "https://example.com/privacy"
};
firebase.auth().onAuthStateChanged((firebaseUser) => {
  if (firebaseUser) {
    document.querySelector("#loader").style.display = "none";
    document.querySelector("main").style.display = "block";
    currentUser = firebaseUser.uid;
    startDataListeners();
  } else {
    document.querySelector("main").style.display = "none";
    firebaseUI.start("#firebaseui-auth-container", firebaseUiConfig);
  }
});

/**
 * Data listeners
 */
function startDataListeners() {
  // Get all our products and render them to the page
  const products = document.querySelector(".products");
  const template = document.querySelector("#product");
  db.collection("products")
    .where("active", "==", true)
    .get()
    .then(function (querySnapshot) {
      querySnapshot.forEach(async function (doc) {
        const priceSnap = await doc.ref
          .collection("prices")
          .orderBy("unit_amount")
          .get();
        if (!"content" in document.createElement("template")) {
          console.error("Your browser doesn't support HTML template elements.");
          return;
        }

        const product = doc.data();
        const container = template.content.cloneNode(true);

        container.querySelector("h2").innerText = product.name.toUpperCase();
        container.querySelector(".description").innerText =
          product.description.toUpperCase() || "";
        // Prices dropdown
        priceSnap.docs.forEach((doc) => {
          const priceId = doc.id;
          const priceData = doc.data();
          const content = document.createTextNode(
            `${new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: priceData.currency
            }).format((priceData.unit_amount / 100).toFixed(2))} per ${
              priceData.interval
            }`
          );
          const option = document.createElement("option");
          option.value = priceId;
          option.appendChild(content);
          container.querySelector("#price").appendChild(option);
        });

        if (product.images.length) {
          const img = container.querySelector("img");
          img.src = product.images[0];
          img.alt = product.name;
        }

        const form = container.querySelector("form");
        form.addEventListener("submit", subscribe);

        products.appendChild(container);
      });
    });

  db.collection("customers")
    .doc(currentUser)
    .collection("subscriptions")
    .where("status", "in", ["trialing", "active"])
    .onSnapshot(async (snapshot) => {
      if (snapshot.empty) {
        // Show products
        document.querySelector("#subscribe").style.display = "block";
        return;
      }
      document.querySelector("#subscribe").style.display = "none";
      document.querySelector("#my-subscription").style.display = "block";
      // In this implementation we only expect one Subscription to exist
      const subscription = snapshot.docs[0].data();
      const priceData = (await subscription.price.get()).data();
      document.querySelector(
        "#my-subscription p"
      ).textContent = `You are paying ${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: priceData.currency
      }).format((priceData.unit_amount / 100).toFixed(2))} per ${
        priceData.interval
      }`;
    });
}

/**
 * Event listeners
 */

// Signout button
document
  .getElementById("signout")
  .addEventListener("click", () => firebase.auth().signOut());

// Checkout handler
async function subscribe(event) {
  event.preventDefault();
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const formData = new FormData(event.target);

  const docRef = await db
    .collection("customers")
    .doc(currentUser)
    .collection("checkout_sessions")
    .add({
      price: formData.get("price"),
      allow_promotion_codes: true,
      success_url: window.location.origin,
      cancel_url: window.location.origin,
      metadata: {
        cell: "item001"
      }
    });

  // Wait for the CheckoutSession to get attached by the extension
  docRef.onSnapshot((snap) => {
    const { sessionId } = snap.data();
    if (sessionId) {
      // We have a session, let's redirect to Checkout
      const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
      stripe.redirectToCheckout({ sessionId });
    }
  });
}

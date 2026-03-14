/* ---------------- feedback modal + submit ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  setupFeedbackModal();
});

function setupFeedbackModal() {
  const feedbackModal = document.getElementById("feedbackModal");
  if (!feedbackModal) return;

  const openBtns = [
    document.getElementById("feedbackOpenBtn"),
    document.getElementById("feedbackFooterBtn")
  ].filter(Boolean);

  const cancelBtn = document.getElementById("feedbackCancelBtn");
  const submitBtn = document.getElementById("feedbackSubmitBtn");
  const backdrop = feedbackModal.querySelector("[data-close-feedback-modal]");

  function openFeedbackModal() {
    feedbackModal.classList.remove("hidden");
  }

  function closeFeedbackModal() {
    feedbackModal.classList.add("hidden");
    clearFeedbackForm();
  }

  openBtns.forEach(btn => {
    btn.addEventListener("click", openFeedbackModal);
  });

  cancelBtn?.addEventListener("click", closeFeedbackModal);
  backdrop?.addEventListener("click", closeFeedbackModal);

  submitBtn?.addEventListener("click", async () => {
    const name = document.getElementById("feedbackName")?.value.trim() || "";
    const email = document.getElementById("feedbackEmail")?.value.trim() || "";
    const type = document.getElementById("feedbackType")?.value || "Send Feedback";
    const message = document.getElementById("feedbackMessage")?.value.trim() || "";

    if (!message) {
      return showToast("Please write a message first!", "error");
    }

    if (!supabaseClient) {
      return showToast("Feedback service unavailable right now.", "error");
    }

    const { error } = await supabaseClient.from("feedback_messages").insert({
      name,
      email,
      type,
      message
    });

    if (error) {
      console.error(error);
      return showToast("Could not send feedback right now.", "error");
    }

    closeFeedbackModal();
    showToast("Thanks! Your message was sent.", "success");
  });
}

function clearFeedbackForm() {
  const name = document.getElementById("feedbackName");
  const email = document.getElementById("feedbackEmail");
  const type = document.getElementById("feedbackType");
  const message = document.getElementById("feedbackMessage");

  if (name) name.value = "";
  if (email) email.value = "";
  if (type) type.value = "Suggest a Tool";
  if (message) message.value = "";
}

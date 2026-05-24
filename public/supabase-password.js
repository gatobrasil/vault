// ============================================================
// VOZIA VAULT — Recuperação de senha com Supabase
// Coloque este arquivo em: public/supabase-password.js
// ============================================================

async function voziaResetPassword(email) {
  const sb = voziaSupabase || iniciarSupabase();

  if (!sb) {
    throw new Error("Supabase não configurado.");
  }

  if (!email) {
    throw new Error("Digite seu e-mail para recuperar a senha.");
  }

  const redirectTo = window.location.origin + "/reset-password.html";

  const { data, error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) throw error;

  return data;
}

async function voziaUpdatePassword(newPassword) {
  const sb = voziaSupabase || iniciarSupabase();

  if (!sb) {
    throw new Error("Supabase não configurado.");
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
  }

  const { data, error } = await sb.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;

  return data;
}

function mostrarMensagemRecuperacao(texto, ok = false) {
  const msgBox = document.getElementById("forgotPasswordMsg");

  if (!msgBox) return;

  msgBox.textContent = texto;
  msgBox.className = "msg" + (ok ? " ok" : "");
  msgBox.style.display = "block";
}

document.addEventListener("DOMContentLoaded", () => {
  const forgotBtn = document.getElementById("forgotPasswordBtn");

  if (!forgotBtn) return;

  forgotBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();

    const email = document.getElementById("loginEmail")?.value?.trim();

    try {
      mostrarMensagemRecuperacao("Enviando e-mail de recuperação...");

      await voziaResetPassword(email);

      mostrarMensagemRecuperacao(
        "Enviamos um link de recuperação para seu e-mail. Abra o link e crie uma nova senha.",
        true
      );
    } catch (e) {
      mostrarMensagemRecuperacao(e.message || "Erro ao enviar recuperação de senha.");
    }
  });
});

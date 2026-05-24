let voziaSupabase = null;

function iniciarSupabase() {
  const cfg = window.VOZIA_SUPABASE_CONFIG;

  if (!cfg || !cfg.url || !cfg.anonKey || cfg.url.includes("COLE_AQUI")) {
    console.warn("Supabase ainda não configurado. Edite public/supabase-config.js");
    return null;
  }

  voziaSupabase = window.supabase.createClient(cfg.url, cfg.anonKey);
  return voziaSupabase;
}

async function voziaGetUser() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) return null;

  const { data, error } = await sb.auth.getUser();

  if (error) {
    console.error(error);
    return null;
  }

  return data.user || null;
}

async function voziaSignUp({ name, email, password, plan, acceptedTerms }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  if (!acceptedTerms) {
    throw new Error("É necessário aceitar os termos antes do cadastro.");
  }

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        plan
      }
    }
  });

  if (error) throw error;

  const user = data.user;

  if (!user) {
    return {
      user: null,
      message: "Cadastro iniciado. Verifique o e-mail se a confirmação estiver ativada."
    };
  }

  const { error: profileError } = await sb.from("profiles").insert({
    id: user.id,
    name,
    email,
    plan: plan || "avaliacao",
    accepted_terms_at: new Date().toISOString()
  });

  if (profileError) throw profileError;

  return { user };
}

async function voziaSignIn({ email, password }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  return data.user;
}

async function voziaSignOut() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

async function voziaLoadProfile() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
}

async function voziaListRecordings() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb
    .from("recordings")
    .select("*")
    .order("phrase_index", { ascending: true });

  if (error) throw error;

  return data || [];
}

async function voziaUploadVoiceRecording({ phraseIndex, phraseCategory, phraseText, audioBlob, durationMs }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const fileName = `frase-${String(phraseIndex + 1).padStart(3, "0")}-${Date.now()}.webm`;
  const path = `${user.id}/${fileName}`;

  const { error: uploadError } = await sb.storage
    .from("voice-recordings")
    .upload(path, audioBlob, {
      contentType: "audio/webm",
      upsert: true
    });

  if (uploadError) throw uploadError;

  const { error: dbError } = await sb.from("recordings").upsert({
    user_id: user.id,
    phrase_index: phraseIndex,
    phrase_category: phraseCategory || "",
    phrase_text: phraseText,
    audio_path: path,
    duration_ms: durationMs || null,
    quality_note: qualidadeAudio(durationMs)
  }, {
    onConflict: "user_id,phrase_index"
  });

  if (dbError) throw dbError;

  return path;
}

async function voziaListLegacyMessages() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb
    .from("legacy_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

async function voziaSaveLegacyMessage({ title, recipient, note, isPriority, audioBlob, durationMs }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) throw new Error("Usuário não autenticado.");

  let audioPath = null;

  if (audioBlob) {
    const fileName = `mensagem-${Date.now()}.webm`;
    audioPath = `${user.id}/${fileName}`;

    const { error: uploadError } = await sb.storage
      .from("legacy-audios")
      .upload(audioPath, audioBlob, {
        contentType: "audio/webm",
        upsert: true
      });

    if (uploadError) throw uploadError;
  }

  const { error } = await sb.from("legacy_messages").insert({
    user_id: user.id,
    title,
    recipient,
    note,
    audio_path: audioPath,
    duration_ms: durationMs || null,
    is_priority: !!isPriority
  });

  if (error) throw error;

  return true;
}

async function voziaRequestCare({ appModel, keyboardInterest, notes }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const { error } = await sb.from("vozia_care_requests").insert({
    user_id: user.id,
    app_model: appModel || "botoes_fixos",
    keyboard_interest: keyboardInterest || "nao",
    notes: notes || "",
    status: "solicitado"
  });

  if (error) throw error;

  return true;
}

async function voziaListCareRequests() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb
    .from("vozia_care_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

function qualidadeAudio(ms) {
  if (!ms) return "Duração não informada.";
  if (ms < 900) return "Áudio muito curto. Regravar se a frase não ficou completa.";
  if (ms > 16000) return "Áudio longo. Verificar pausas e ruídos.";
  return "Boa duração.";
}
async function voziaResetPassword(email) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

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
  if (!sb) throw new Error("Supabase não configurado.");

  if (!newPassword || newPassword.length < 6) {
    throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
  }

  const { data, error } = await sb.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;

  return data;
}
window.addEventListener("DOMContentLoaded", () => {
  iniciarSupabase();
});
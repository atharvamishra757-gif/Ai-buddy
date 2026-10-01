import { h, icon, toast } from "../ui.js";
import { api, post, auth } from "../api.js";
import {
  field,
  textInput,
  errorSummary,
  setFieldError,
} from "../components.js";

function brandBlock() {
  return h(
    "div",
    { class: "auth-logo" },
    h("div", { class: "brand-mark" }, "S"),
    h(
      "div",
      {},
      h("div", { class: "brand-name" }, "Ai-Buddy"),
      h("div", { class: "brand-sub" }, "Smart planner"),
    ),
  );
}

export function authPage({ onAuthed, mode: initialMode = "login" }) {
  let mode = initialMode;

  const root = h("div", { class: "auth-bg" });

  function render() {
    root.innerHTML = "";
    const isLogin = mode === "login";

    const form = h("form", {
      class: "stack",
      style: { gap: "14px" },
      novalidate: true,
    });

    if (!isLogin) {
      form.append(
        field({
          label: "Full name",
          name: "name",
          id: "name",
          input: textInput({
            name: "name",
            placeholder: "Aarav Sharma",
            autocomplete: "name",
          }),
        }),
      );
    }
    form.append(
      field({
        label: "Email",
        name: "email",
        id: "email",
        input: textInput({
          name: "email",
          type: "email",
          placeholder: "you@college.edu",
          autocomplete: "email",
        }),
      }),
    );
    form.append(
      field({
        label: "Password",
        name: "password",
        id: "password",
        input: textInput({
          name: "password",
          type: "password",
          placeholder: "••••••••",
          autocomplete: isLogin ? "current-password" : "new-password",
        }),
        hint: !isLogin ? "At least 6 characters." : null,
      }),
    );
    if (!isLogin) {
      form.append(
        field({
          label: "Confirm password",
          name: "confirmPassword",
          id: "confirmPassword",
          input: textInput({
            name: "confirmPassword",
            type: "password",
            autocomplete: "new-password",
          }),
        }),
      );
    }

    const submit = h(
      "button",
      { class: "btn btn-primary btn-lg btn-block", type: "submit" },
      isLogin ? "Sign in" : "Create account",
    );
    form.append(submit);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      for (const el of form.querySelectorAll(".err")) el.remove();
      form
        .querySelectorAll(".invalid")
        .forEach((el) => el.classList.remove("invalid"));

      submit.disabled = true;
      submit.textContent = isLogin ? "Signing in…" : "Creating account…";
      try {
        const res = await post(isLogin ? "/auth/login" : "/auth/register", fd);
        auth.token = res.token;
        toast(
          `Welcome${isLogin ? " back" : ""}, ${res.user.name.split(" ")[0]}!`,
          { kind: "ok", title: "Signed in" },
        );
        onAuthed(res.user);
      } catch (err) {
        for (const [k, v] of Object.entries(err.fields || {}))
          setFieldError(form, k, v);
        if (!Object.keys(err.fields || {}).length)
          toast(err.message, { kind: "err", title: "Could not sign in" });
        submit.disabled = false;
        submit.textContent = isLogin ? "Sign in" : "Create account";
      }
    });

    const card = h(
      "div",
      { class: "auth-card" },
      brandBlock(),
      h(
        "div",
        { class: "auth-title" },
        h("h1", {}, isLogin ? "Welcome back" : "Start studying smarter"),
        h(
          "p",
          {},
          isLogin
            ? "Your AI planner is ready with your subjects, exams and deadlines."
            : "Build a personalised study plan in under a minute.",
        ),
      ),

      form,

      h("div", { class: "divider" }, isLogin ? "or" : "already registered?"),
      isLogin
        ? h(
            "button",
            {
              class: "btn btn-block",
              onclick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.innerHTML = "Loading demo data…";
                try {
                  const res = await post("/auth/demo", {});
                  auth.token = res.token;
                  toast("Loaded a realistic B.Tech CSE sample planner.", {
                    kind: "ok",
                    title: "Demo account",
                  });
                  onAuthed(res.user);
                } catch (err) {
                  toast(err.message, { kind: "err" });
                  btn.disabled = false;
                  btn.textContent = "Explore the demo account";
                }
              },
            },
            icon("sparkles", 15),
            "Explore the demo account",
          )
        : h(
            "button",
            {
              class: "btn btn-block",
              onclick: () => {
                mode = "login";
                render();
              },
            },
            "Sign in instead",
          ),

      h(
        "div",
        { class: "auth-alt" },
        isLogin ? "New here? " : "Already have an account? ",
        h(
          "button",
          {
            onclick: () => {
              mode = isLogin ? "register" : "login";
              render();
            },
          },
          isLogin ? "Create an account" : "Sign in",
        ),
      ),
      h(
        "div",
        { class: "auth-alt tiny muted", style: { marginTop: "14px" } },
        "Your data is stored privately on your own machine.",
      ),
    );

    root.append(card);
  }

  render();
  return root;
}

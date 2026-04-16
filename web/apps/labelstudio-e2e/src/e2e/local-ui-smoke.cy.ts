describe("local ui smoke", () => {
  it("logs in and opens the project data page", () => {
    cy.visit("/user/login/");

    cy.get("input[name='email']").clear().type("admin");
    cy.get("input[name='password']").clear().type("11111111");
    cy.get("button[type='submit']").click();

    cy.url({ timeout: 20000 }).should("not.include", "/user/login");

    cy.visit("/projects/6/data?tab=15");

    cy.contains("任务", { timeout: 30000 }).should("exist");
  });
});

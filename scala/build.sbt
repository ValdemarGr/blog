ThisBuild / scalaVersion := "3.3.1"
ThisBuild / organization := "io.github.valdemargr"

ThisBuild / licenses := List("Apache-2.0" -> url("http://www.apache.org/licenses/LICENSE-2.0"))
ThisBuild / developers := List(
  Developer("valdemargr", "Valdemar Grange", "randomvald0069@gmail.com", url("https://github.com/valdemargr"))
)
ThisBuild / headerLicense := Some(HeaderLicense.Custom("Copyright (c) 2023 Valdemar Grange"))
ThisBuild / headerEmptyLine := false

ThisBuild / githubWorkflowAddedJobs ++= Seq(
  WorkflowJob(
    id = "compile-docs",
    name = "Verify that the docs compile",
    scalas = List(scala213Version),
    steps = WorkflowStep.Use(
      UseRef.Public("actions", "checkout", "v3"),
      name = Some("Checkout current branch (fast)"),
      params = Map("fetch-depth" -> "0")
    ) :: dbStep ::
      WorkflowStep.SetupJava(githubWorkflowJavaVersions.value.toList) ++
      githubWorkflowGeneratedCacheSteps.value ++
      List(
        WorkflowStep.Sbt(List("docs/mdoc"), name = Some("Compile the documentation scala code")),
        WorkflowStep.Sbt(List("readme/mdoc"), name = Some("Compile the readme scala code"))
      )
  ),
  WorkflowJob(
    id = "docs",
    name = "Run mdoc docs",
    needs = List("compile-docs"),
    scalas = List("3.3.1"),
    steps = WorkflowStep.Use(
      UseRef.Public("actions", "checkout", "v3"),
      name = Some("Checkout current branch (fast)"),
      params = Map("fetch-depth" -> "0")
    ) :: dbStep ::
      WorkflowStep.SetupJava(githubWorkflowJavaVersions.value.toList) ++
      githubWorkflowGeneratedCacheSteps.value ++
      // We need all commits to track down the tag for the VERSION variable
      List(
        WorkflowStep.Run(
          List(
            "git fetch --all --tags --force"
          )
        ),
        WorkflowStep.Sbt(List("docs/mdoc")),
        WorkflowStep.Use(
          UseRef.Public("actions", "setup-node", "v3"),
          params = Map("node-version" -> "18")
        ),
        WorkflowStep.Run(List("cd website && yarn install")),
        WorkflowStep.Run(
          List(
            "git config --global user.name ValdemarGr",
            "git config --global user.email randomvald0069@gmail.com",
            "cd website && yarn deploy"
          ),
          env = Map(
            "GIT_USER" -> "valdemargr",
            "GIT_PASS" -> "${{ secrets.GITHUB_TOKEN }}"
          )
        )
      ),
    cond = Some("""github.event_name != 'pull_request' && (startsWith(github.ref, 'refs/tags/v') || github.ref == 'refs/heads/main')""")
  )
)

lazy val docs = project
  .in(file("."))
  .settings(
    moduleName := "site",
    mdocOut := file("../site"),
    tlFatalWarnings := false
  )
  .enablePlugins(MdocPlugin, DocusaurusPlugin, NoPublishPlugin)

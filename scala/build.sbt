ThisBuild / scalaVersion := "3.3.1"
ThisBuild / organization := "io.github.valdemargr"

ThisBuild / licenses := List("Apache-2.0" -> url("http://www.apache.org/licenses/LICENSE-2.0"))
ThisBuild / developers := List(
  Developer("valdemargr", "Valdemar Grange", "randomvald0069@gmail.com", url("https://github.com/valdemargr"))
)
ThisBuild / headerLicense := Some(HeaderLicense.Custom("Copyright (c) 2023 Valdemar Grange"))
ThisBuild / headerEmptyLine := false

lazy val docs = project
  .in(file("."))
  .settings(
    moduleName := "site",
    mdocOut := file("../blog"),
    tlFatalWarnings := false
  )
  .enablePlugins(MdocPlugin, NoPublishPlugin)

ThisBuild / scalaVersion := "2.13.12"
ThisBuild / organization := "io.github.valdemargr"

ThisBuild / licenses := List("Apache-2.0" -> url("http://www.apache.org/licenses/LICENSE-2.0"))
ThisBuild / developers := List(
  Developer("valdemargr", "Valdemar Grange", "randomvald0069@gmail.com", url("https://github.com/valdemargr"))
)
lazy val blog = project
  .in(file("."))
  .settings(
    name := "blog",
    mdocOut := file("../site/blog"),
    mdocIn := file("blog"),
    libraryDependencies ++= Seq(
      "io.github.valdemargr" %% "catch-effect" % "0.1.1",
      "io.github.casehubdk" %% "hxl" % "0.2.3",
    )
  )
  .enablePlugins(MdocPlugin)

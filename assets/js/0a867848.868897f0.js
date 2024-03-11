"use strict";(self.webpackChunksite=self.webpackChunksite||[]).push([[700],{4970:(e,n,i)=>{i.r(n),i.d(n,{assets:()=>l,contentTitle:()=>s,default:()=>h,frontMatter:()=>a,metadata:()=>o,toc:()=>c});var r=i(5893),t=i(1151);const a={slug:"simplify-fp-crud",title:"Simplifying a functional crud route"},s=void 0,o={permalink:"/blog/simplify-fp-crud",editUrl:"https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/blog/2024-03-09-simplifying-functional-crud-route.md",source:"@site/blog/2024-03-09-simplifying-functional-crud-route.md",title:"Simplifying a functional crud route",description:"Most larger applications eventually solve three problems:",date:"2024-03-09T00:00:00.000Z",formattedDate:"March 9, 2024",tags:[],readingTime:14.615,hasTruncateMarker:!1,authors:[],frontMatter:{slug:"simplify-fp-crud",title:"Simplifying a functional crud route"},unlisted:!1},l={authorsImageUrls:[]},c=[{value:"Motivation",id:"motivation",level:2},{value:"Domain",id:"domain",level:2},{value:"The initial implementation",id:"the-initial-implementation",level:2},{value:"Functional error handling",id:"functional-error-handling",level:2},{value:"Accumulating errors",id:"accumulating-errors",level:2},{value:"Handling batching",id:"handling-batching",level:2},{value:"Erasing <code>EitherT</code>",id:"erasing-eithert",level:2},{value:"Conclusion",id:"conclusion",level:2}];function d(e){const n={a:"a",admonition:"admonition",annotation:"annotation",code:"code",h2:"h2",li:"li",math:"math",mi:"mi",mn:"mn",mrow:"mrow",msup:"msup",ol:"ol",p:"p",pre:"pre",semantics:"semantics",span:"span",table:"table",tbody:"tbody",td:"td",th:"th",thead:"thead",tr:"tr",ul:"ul",...(0,t.a)(),...e.components};return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(n.p,{children:"Most larger applications eventually solve three problems:"}),"\n",(0,r.jsxs)(n.ol,{children:["\n",(0,r.jsx)(n.li,{children:"Raising errors that need to be handled."}),"\n",(0,r.jsx)(n.li,{children:"Handling lists of data as opposed to single entities."}),"\n",(0,r.jsx)(n.li,{children:"Optionally calling apis, depending on input."}),"\n"]}),"\n",(0,r.jsx)(n.p,{children:"To exemplify what issues may arrise when dealing with such problems, we will create an list of entities by performing some operations for each entity:"}),"\n",(0,r.jsxs)(n.ol,{children:["\n",(0,r.jsxs)(n.li,{children:["Parse the input's phone number (",(0,r.jsx)(n.a,{href:"https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/",children:"as opposed to validating"}),")."]}),"\n",(0,r.jsx)(n.li,{children:"Reading the relevant organization for the request from the database, raising an error if the organization is not found."}),"\n",(0,r.jsx)(n.li,{children:"Construct the resulting entities, by fetching an access token from the database and calling a remote api to create them in the external system."}),"\n",(0,r.jsx)(n.li,{children:"Insert the resulting entities into the database."}),"\n"]}),"\n",(0,r.jsx)(n.h2,{id:"motivation",children:"Motivation"}),"\n",(0,r.jsx)(n.p,{children:"When using by-the-book functional programming tools to perform the tasks at hand the code quickly grows unwieldy.\nBy applying more exotic functional abstractions, we can simplify the code and make it more extensible."}),"\n",(0,r.jsx)(n.h2,{id:"domain",children:"Domain"}),"\n",(0,r.jsx)(n.p,{children:"Consider the following prelude to illustrate the issue at hand."}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:'final case class InputUser(\n  name: String,\n  age: Int,\n  phone: String,\n  shouldBeCreatedInApi: Boolean\n)\n\nfinal case class Organization(\n  id: UUID,\n  name: String\n)\n\nfinal case class Phone(value: String)\ndef parsePhone(phone: String): Either[String, Phone] = ???\n\nfinal case class User(\n  id: UUID,\n  name: String,\n  age: Int,\n  phone: Phone,\n  api: Option[Int],\n  organization: UUID\n)\n\nfinal case class CreateUser(name: String, phone: Phone)\ntrait UserApi {\n  // returns the ids of the created users\n  def createUsers(token: String, inputs: NonEmptyList[CreateUser]): IO[NonEmptyList[Int]]\n}\n\ntrait Repo {\n  def insertUser(user: NonEmptyList[User]): IO[Unit]\n  def getOrganization(id: UUID): IO[Option[Organization]]\n  def getOrganizationAccessToken(id: UUID): IO[String]\n}\n\nsealed trait Error\nfinal case class PhoneParseError(message: String) extends Throwable with Error {\n  override def getMessage: String = message\n}\n\nfinal case class OrganizationNotFound() extends Throwable with Error {\n  override def getMessage: String = s"Organization not found"\n}\n'})}),"\n",(0,r.jsx)(n.p,{children:"With the domain in place, we can start to explore how we can satisfy the requirements for our API."}),"\n",(0,r.jsx)(n.h2,{id:"the-initial-implementation",children:"The initial implementation"}),"\n",(0,r.jsx)(n.p,{children:"We'll start off with a crude and complex implementation to set the stage."}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"def insertUsers(\n  organizationId: UUID,\n  inputs: NonEmptyList[InputUser],\n  api: UserApi,\n  repo: Repo\n): IO[Either[Error, NonEmptyList[UUID]]] = {\n  val run: IO[NonEmptyList[UUID]] = \n    for {\n      withPhone <- inputs.traverse{ iu =>\n        IO.fromEither(parsePhone(iu.phone).leftMap(PhoneParseError(_))).map(x => (iu, x))\n      }\n      _ <- repo.getOrganization(organizationId).flatMap{\n        case None => IO.raiseError(OrganizationNotFound())\n        case Some(_) => IO.unit\n      }\n\n      usersThatNeedToBeCreated = withPhone.filter{ case (iu, _) => iu.shouldBeCreatedInApi }\n\n      withApiIds <- usersThatNeedToBeCreated\n        .toNel\n        .toList\n        .flatTraverse { nel =>\n          repo.getOrganizationAccessToken(organizationId).flatMap{ token =>\n            val creates = nel.map{ case (iu, phone) => CreateUser(iu.name, phone) }\n            api.createUsers(token, creates).map(_.zip(nel)).map(_.toList)\n          }\n        }\n\n      createdUsers = withApiIds.map{ case (apiId, (iu, phone)) => (iu, phone, Some(apiId)) }\n      nonCreatedUsers = withPhone\n        .collect{ case (iu, phone) if !(iu.shouldBeCreatedInApi) => (iu, phone, Option.empty[Int]) }\n\n      users <- (createdUsers ++ nonCreatedUsers).traverse { case (iu, phone, apiId) =>\n        UUIDGen.randomUUID[IO].map(id => User(id, iu.name, iu.age, phone, apiId, organizationId))\n      }\n      _ <- users.toNel.traverse_(xs => repo.insertUser(xs))\n    } yield users.map(_.id).toNel.get\n\n  run.map(Right(_)).recover{ case e: Error => Left(e) }\n}\n"})}),"\n",(0,r.jsx)(n.p,{children:"The initial implementation has some issues, some of which are syntatic and others semantic."}),"\n",(0,r.jsxs)(n.ol,{children:["\n",(0,r.jsx)(n.li,{children:"(syntax) We pay a steep price in terms of complexity for batching api operations."}),"\n",(0,r.jsx)(n.li,{children:'(semantics) Errors are not accumulated, the first error that occurs "wins".'}),"\n",(0,r.jsx)(n.li,{children:"(syntax) If more steps are added then the tuple of data we pass around will grow."}),"\n",(0,r.jsx)(n.li,{children:"(semantics) Any intermediate exception handlers may eat our error since it is a exception."}),"\n",(0,r.jsx)(n.li,{children:"(syntax) Partitioning the inputs into two groups is not a pleasant experience and scales poorly with more groups."}),"\n"]}),"\n",(0,r.jsx)(n.p,{children:"We will first address the correctness of our solution, and then we will address the syntactic issues."}),"\n",(0,r.jsx)(n.h2,{id:"functional-error-handling",children:"Functional error handling"}),"\n",(0,r.jsx)(n.p,{children:"The classic answer to high-level error handling when effects are involved in functional programming are monad transformers.\nAlthough this won't be our final destination, adding a monad transformer as an intermediate stepping stone in our refactoring will help us understand the problem better."}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"def insertUsers(\n  organizationId: UUID,\n  inputs: NonEmptyList[InputUser],\n  api: UserApi,\n  repo: Repo\n): IO[Either[Error, NonEmptyList[UUID]]] = {\n  type G[A] = EitherT[IO, Error, A]\n  val G = MonadError[G, Error]\n  val liftK: IO ~> G = EitherT.liftK[IO, Error]\n  val run: G[NonEmptyList[UUID]] = \n    for {\n      withPhone <- inputs.traverse{ iu =>\n        G.fromEither(parsePhone(iu.phone).leftMap(PhoneParseError(_))).map(x => (iu, x))\n      }\n      _ <- liftK(repo.getOrganization(organizationId)).flatMap{\n        case None => G.raiseError[Unit](OrganizationNotFound())\n        case Some(_) => G.unit\n      }\n\n      usersThatNeedToBeCreated = withPhone.filter{ case (iu, _) => iu.shouldBeCreatedInApi }\n\n      withApiIds <- liftK {\n        usersThatNeedToBeCreated\n          .toNel\n          .toList\n          .flatTraverse { nel =>\n            repo.getOrganizationAccessToken(organizationId).flatMap{ token =>\n              val creates = nel.map{ case (iu, phone) => CreateUser(iu.name, phone) }\n              api.createUsers(token, creates).map(_.zip(nel)).map(_.toList)\n            }\n          }\n      }\n\n      createdUsers = withApiIds.map{ case (apiId, (iu, phone)) => (iu, phone, Some(apiId)) }\n      nonCreatedUsers = withPhone\n        .collect{ case (iu, phone) if !(iu.shouldBeCreatedInApi) => (iu, phone, Option.empty[Int]) }\n\n      users <- liftK {\n        (createdUsers ++ nonCreatedUsers).traverse { case (iu, phone, apiId) =>\n          UUIDGen.randomUUID[IO].map(id => User(id, iu.name, iu.age, phone, apiId, organizationId))\n        }\n      }\n      _ <- liftK(users.toNel.traverse_(xs => repo.insertUser(xs)))\n    } yield users.map(_.id).toNel.get\n\n  run.value\n}\n"})}),"\n",(0,r.jsxs)(n.p,{children:["With the addition of ",(0,r.jsx)(n.code,{children:"EitherT"})," we have alleviated the 4th concern, but with the unfortunate side effect of making the code more complex.\nBefore handling ",(0,r.jsx)(n.code,{children:"EitherT"}),", let's take a look at another issue."]}),"\n",(0,r.jsx)(n.h2,{id:"accumulating-errors",children:"Accumulating errors"}),"\n",(0,r.jsxs)(n.p,{children:["Monads are inherently sequential, and as such, they are not well suited for accumulating errors.\nInstead, we are looking for an algebraic structure that allows independent operations to be combined.\nTo solve this riddle, we'll invite ",(0,r.jsx)(n.code,{children:"Applicative"})," to the war table.\n",(0,r.jsx)(n.code,{children:"Either"})," has an accumulating cousin called ",(0,r.jsx)(n.code,{children:"Validated"})," that forms an ",(0,r.jsx)(n.code,{children:"Applicative"})," if the error ",(0,r.jsx)(n.code,{children:"E"})," forms a ",(0,r.jsx)(n.code,{children:"Semigroup"}),".\n",(0,r.jsx)(n.code,{children:"cats"})," gives some useful type aliases for ",(0,r.jsx)(n.code,{children:"Validated"}),", notably ",(0,r.jsx)(n.code,{children:"ValidatedNec"})," which has the following definition:"]}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"type ValidatedNec[E, A] = Validated[NonEmptyChain[E], A]\n"})}),"\n",(0,r.jsxs)(n.p,{children:["Since ",(0,r.jsx)(n.code,{children:"NonEmptyChain"})," forms a ",(0,r.jsx)(n.code,{children:"Semigroup"})," (it has a lawful combine function), then we have our ",(0,r.jsx)(n.code,{children:"Applicative"}),"."]}),"\n",(0,r.jsxs)(n.p,{children:["Writing out the code (or reading it for that matter) with ",(0,r.jsx)(n.code,{children:"Validated"})," is not going to be a pleasant experience.\nIt will involve a bunch of values of type ",(0,r.jsx)(n.code,{children:"IO[ValidatedNec[Error, A]]"})," which all require a bunch of ",(0,r.jsx)(n.code,{children:"sequence"}),"ing to wire together.\nInstead, bear with me, we can introduce another typeclass that will help us out."]}),"\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.code,{children:"cats"})," distills the relationship for structures that have ",(0,r.jsx)(n.code,{children:"Applicative"})," or ",(0,r.jsx)(n.code,{children:"Monad"})," semantics into a typeclass ",(0,r.jsx)(n.code,{children:"Parallel"}),"."]}),"\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.code,{children:"Parallel"})," for structures ",(0,r.jsx)(n.code,{children:"F"})," and ",(0,r.jsx)(n.code,{children:"G"})," implies that we know:"]}),"\n",(0,r.jsxs)(n.ul,{children:["\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.code,{children:"F ~> G"})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.code,{children:"G ~> F"})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.code,{children:"Applicative[G]"})}),"\n",(0,r.jsx)(n.li,{children:(0,r.jsx)(n.code,{children:"Monad[F]"})}),"\n"]}),"\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.code,{children:"Parallel"})," does not neccessarily mean parallel execution, but rather the ability to switch to a different context for intermediate operations.\n",(0,r.jsx)(n.code,{children:"Parallel"})," defines the realtionship between ",(0,r.jsx)(n.code,{children:"Either"})," and ",(0,r.jsx)(n.code,{children:"Validated"})," for some type ",(0,r.jsx)(n.code,{children:"E"})," if ",(0,r.jsx)(n.code,{children:"E"})," forms a ",(0,r.jsx)(n.code,{children:"Semigroup"}),":"]}),"\n",(0,r.jsxs)(n.ul,{children:["\n",(0,r.jsxs)(n.li,{children:[(0,r.jsx)(n.code,{children:"Either[E, *] ~> Validated[E, *]"})," by ",(0,r.jsx)(n.code,{children:"toValidated"})]}),"\n",(0,r.jsxs)(n.li,{children:[(0,r.jsx)(n.code,{children:"Validated[E, *] ~> Either[E, *]"})," by ",(0,r.jsx)(n.code,{children:"toEither"})]}),"\n",(0,r.jsxs)(n.li,{children:[(0,r.jsx)(n.code,{children:"Applicative[Validated[E, *]]"})," since ",(0,r.jsx)(n.code,{children:"E"})," forms a ",(0,r.jsx)(n.code,{children:"Semigroup"})]}),"\n",(0,r.jsxs)(n.li,{children:[(0,r.jsx)(n.code,{children:"Monad[Either[E, *]]"})," by construction"]}),"\n"]}),"\n",(0,r.jsxs)(n.p,{children:["Now for the application of the above discussion.\nOur ",(0,r.jsx)(n.code,{children:"EitherT"})," also has a ",(0,r.jsx)(n.code,{children:"Parallel"})," instance that allows us to accumulate errors.\nLets introduce a new error type that contains a non-empty collection of errors instead."]}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"type Errors = NonEmptyChain[Error]\n"})}),"\n",(0,r.jsxs)(n.p,{children:["We'll use ",(0,r.jsx)(n.code,{children:"parTraverse"})," instead of ",(0,r.jsx)(n.code,{children:"traverse"})," when parsing the phone numbers."]}),"\n",(0,r.jsxs)(n.admonition,{type:"info",children:[(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.code,{children:"parTraverse"})," does the same as ",(0,r.jsx)(n.code,{children:"traverse"})," but uses the ",(0,r.jsx)(n.code,{children:"Applicative"})," inside of ",(0,r.jsx)(n.code,{children:"Parallel"})," to sequence the effects:"]}),(0,r.jsxs)(n.ol,{children:["\n",(0,r.jsxs)(n.li,{children:["given a fuction ",(0,r.jsx)(n.code,{children:"A => F[B]"}),", switch ",(0,r.jsx)(n.code,{children:"F"})," to ",(0,r.jsx)(n.code,{children:"G"})," via ",(0,r.jsx)(n.code,{children:"F ~> G"})," such that ",(0,r.jsx)(n.code,{children:"A => G[B]"})]}),"\n",(0,r.jsxs)(n.li,{children:["use ",(0,r.jsx)(n.code,{children:"G"}),"'s ",(0,r.jsx)(n.code,{children:"Applicative"})," to sequence the results such that ",(0,r.jsx)(n.code,{children:"G[T[B]]"})," for some ",(0,r.jsx)(n.code,{children:"Traverse[T]"})]}),"\n",(0,r.jsxs)(n.li,{children:["switches back to ",(0,r.jsx)(n.code,{children:"F"})," via ",(0,r.jsx)(n.code,{children:"G ~> F"})," such that ",(0,r.jsx)(n.code,{children:"F[T[B]]"}),"."]}),"\n"]})]}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"def insertUsers(\n  organizationId: UUID,\n  inputs: NonEmptyList[InputUser],\n  api: UserApi,\n  repo: Repo\n): IO[Either[Errors, NonEmptyList[UUID]]] = {\n  type G[A] = EitherT[IO, Errors, A]\n  val G = MonadError[G, Errors]\n  val liftK: IO ~> G = EitherT.liftK[IO, Errors]\n  implicit val parallelG: Parallel[G] = EitherT.accumulatingParallel[IO, Errors]\n  val run: G[NonEmptyList[UUID]] = \n    for {\n      withPhone <- inputs.parTraverse{ iu =>\n        G.fromEither {\n          parsePhone(iu.phone).leftMap(x => NonEmptyChain.one(PhoneParseError(x)))\n        }.map(x => (iu, x))\n      }\n      _ <- liftK(repo.getOrganization(organizationId)).flatMap{\n        case None => G.raiseError[Unit](NonEmptyChain.one(OrganizationNotFound()))\n        case Some(_) => G.unit\n      }\n\n      usersThatNeedToBeCreated = withPhone.filter{ case (iu, _) => iu.shouldBeCreatedInApi }\n\n      withApiIds <- liftK {\n        usersThatNeedToBeCreated\n          .toNel\n          .toList\n          .flatTraverse { nel =>\n            repo.getOrganizationAccessToken(organizationId).flatMap{ token =>\n              val creates = nel.map{ case (iu, phone) => CreateUser(iu.name, phone) }\n              api.createUsers(token, creates).map(_.zip(nel)).map(_.toList)\n            }\n          }\n      }\n\n      createdUsers = withApiIds.map{ case (apiId, (iu, phone)) => (iu, phone, Some(apiId)) }\n      nonCreatedUsers = withPhone\n        .collect{ case (iu, phone) if !(iu.shouldBeCreatedInApi) => (iu, phone, Option.empty[Int]) }\n\n      users <- liftK {\n        (createdUsers ++ nonCreatedUsers).traverse { case (iu, phone, apiId) =>\n          UUIDGen.randomUUID[IO].map(id => User(id, iu.name, iu.age, phone, apiId, organizationId))\n        }\n      }\n      _ <- liftK(users.toNel.traverse_(xs => repo.insertUser(xs)))\n    } yield users.map(_.id).toNel.get\n\n  run.value\n}\n"})}),"\n",(0,r.jsxs)(n.p,{children:["This solves issue 2.\nThere is a lot of considerations behind our parallel instance.\nA ",(0,r.jsx)(n.code,{children:"Parallel"})," instance for ",(0,r.jsx)(n.code,{children:"EitherT"})," is not a free lunch, it comes with ambiguity.\nMultiple valid ",(0,r.jsx)(n.code,{children:"Parallel"})," instances for ",(0,r.jsx)(n.code,{children:"EitherT"})," exist, but that is another topic."]}),"\n",(0,r.jsx)(n.p,{children:"With this addition we have solved all issues regarding semantics.\nNow we can take try to make the solution syntactically more pleasing."}),"\n",(0,r.jsx)(n.h2,{id:"handling-batching",children:"Handling batching"}),"\n",(0,r.jsx)(n.p,{children:"We pay a hefty price for batching, since we have to manually partition our batches and handle the case where there are no elements in the batch."}),"\n",(0,r.jsxs)(n.p,{children:["Say we would like to solve our batching issue once and for all.\nBy exploring commonplace batching libraries, one would quickly find that most use global state and timers.\nSolving problems algebraically as opposed to heuristically, is something functional programmers should be good at.\n",(0,r.jsx)(n.a,{href:"https://dl.acm.org/doi/10.1145/2628136.2628144",children:"Haxl"})," is an optimistic algebraic solution for batching."]}),"\n",(0,r.jsx)(n.p,{children:"Haxl is a library for Haskell, but implementations for Scala also exist."}),"\n",(0,r.jsxs)(n.ul,{children:["\n",(0,r.jsxs)(n.li,{children:[(0,r.jsx)(n.a,{href:"https://github.com/xebia-functional/fetch",children:"Fetch"})," is a library that is close to Haxl and has a plentyful collection of utilities."]}),"\n",(0,r.jsxs)(n.li,{children:[(0,r.jsx)(n.a,{href:"https://github.com/casehubdk/hxl",children:"Hxl"})," is a small (pure) library that focuses on the core of Haxl and extensibility whilst being algebraically correct."]}),"\n",(0,r.jsxs)(n.li,{children:[(0,r.jsx)(n.a,{href:"https://github.com/zio/zio-query",children:"ZQuery"})," is a library that that also provides a Haxl-like experience, being it is built on top of ",(0,r.jsx)(n.code,{children:"ZIO"}),", it is not as typeclass focused but instead leans heavily into ",(0,r.jsx)(n.code,{children:"ZIO"}),"."]}),"\n"]}),"\n",(0,r.jsxs)(n.p,{children:["Since this post is about simplifying and using well considered algebraic principles, we will be using ",(0,r.jsx)(n.code,{children:"Hxl"}),"."]}),"\n",(0,r.jsxs)(n.admonition,{type:"info",children:[(0,r.jsx)(n.p,{children:"Haxl is optimistic since it assumes (hopes) that every instance of a data source fetch is the same number of flatMaps away from the root.\nIf the number of flatMaps is indeterministic then Haxl may produce poor batches:"}),(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"fetchA.flatMap{ _ =>\n  if (randomBoolean()) Hxl.unit.flatMap(_ => fetchB)\n  else fetchB\n}\n"})})]}),"\n",(0,r.jsxs)(n.p,{children:["To allow batching we must lift our batched api into ",(0,r.jsx)(n.code,{children:"Hxl"}),".\nAs in the Haxl paper, we must define datasources for our apis."]}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"final case class InsertUserKey(user: User)\ncase object InsertUser extends DSKey[InsertUserKey, Unit]\n\ndef insertUserDataSource(repo: Repo): DataSource[IO, InsertUserKey, Unit] = \n  DataSource.void(InsertUser) { (keys: NonEmptyList[InsertUserKey]) =>\n    repo.insertUser(keys.map(_.user)).void\n  }\n\ndef insertUser(user: User, repo: Repo): Hxl[IO, Unit] =\n  Hxl(InsertUserKey(user), insertUserDataSource(repo)).void\n\nfinal case class CreateUsersKey(users: CreateUser)\nobject CreateUsersKey {\n  implicit val show: Show[CreateUsersKey] = Show.fromToString\n}\nfinal case class CreateUsers(token: String) extends DSKey[CreateUsersKey, Int]\n\ndef createUserDataSource(token: String, api: UserApi): DataSource[IO, CreateUsersKey, Int] = \n  DataSource.from(CreateUsers(token)) { (keys: NonEmptyList[CreateUsersKey]) =>\n    api.createUsers(token, keys.map(_.users)).map{ results =>\n      keys.zip(results).toList.toMap\n    }\n  }\n\ndef createUser(input: CreateUser, token: String, api: UserApi): Hxl[IO, Int] =\n  Hxl.force(CreateUsersKey(input), createUserDataSource(token, api))\n"})}),"\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.code,{children:"Hxl"})," only forms an ",(0,r.jsx)(n.code,{children:"Applicative"}),", but we need ",(0,r.jsx)(n.code,{children:"flatMap"})," to express our program.\n",(0,r.jsx)(n.code,{children:"Hxl"})," provides ",(0,r.jsx)(n.code,{children:"andThen"})," (like ",(0,r.jsx)(n.code,{children:"Validated"}),") and a ",(0,r.jsx)(n.code,{children:"Monad"}),"ic view ",(0,r.jsx)(n.code,{children:"HxlM"}),", like ",(0,r.jsx)(n.code,{children:"Either"})," is to ",(0,r.jsx)(n.code,{children:"Validated"}),"."]}),"\n",(0,r.jsxs)(n.p,{children:["Before the next iteration, note that we only need to load the token if we have at least one user that needs to be created in the api.\nWe can use ",(0,r.jsx)(n.code,{children:"Hxl"})," to load the token exactly once.\nBut not all tasks need to be solved with the same tool, if a simpler one is available.\nWe can look towards memoization to lazily load the token."]}),"\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.code,{children:"Hxl"}),", by default, does only provide an ",(0,r.jsx)(n.code,{children:"Applicative"})," instance.\nHowever, we can import a ",(0,r.jsx)(n.code,{children:"Parallel"})," instance for ",(0,r.jsx)(n.code,{children:"HxlM"})," which will let us combine the resulting ",(0,r.jsx)(n.code,{children:"Hxl"}),"s in parallel if our effect type also forms a ",(0,r.jsx)(n.code,{children:"Parallel"}),"."]}),"\n",(0,r.jsx)(n.p,{children:"Now we can express our batching a tad more elegantly."}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"def insertUsers(\n  organizationId: UUID,\n  inputs: NonEmptyList[InputUser],\n  api: UserApi,\n  repo: Repo\n): IO[Either[Errors, NonEmptyList[UUID]]] = {\n  type G[A] = EitherT[IO, Errors, A]\n  val G = MonadError[G, Errors]\n  val liftK: IO ~> G = EitherT.liftK[IO, Errors]\n  implicit val parallelG: Parallel[G] = EitherT.accumulatingParallel[IO, Errors]\n  import hxl.instances.hxlm.parallel._\n  def run(input: InputUser, getToken: IO[String]): HxlM[G, UUID] = \n    for {\n      phone <- HxlM.liftF {\n        G.fromEither(parsePhone(input.phone).leftMap(x => NonEmptyChain.one(PhoneParseError(x))))\n      }\n      tokOpt <- HxlM.liftF(liftK(getToken)).map(_.some.filter(_ => input.shouldBeCreatedInApi))\n      apiId <- tokOpt.traverse(createUser(CreateUser(input.name, phone), _, api)).mapK(liftK).monadic\n      id <- HxlM.liftF(UUIDGen.randomUUID[G])\n      u = User(id, input.name, input.age, phone, apiId, organizationId)\n      _ <- insertUser(u, repo).mapK(liftK).monadic\n    } yield id\n\n  val ga = for {\n    _ <- liftK(repo.getOrganization(organizationId)).flatMap{\n      case None => G.raiseError[Unit](NonEmptyChain.one(OrganizationNotFound()))\n      case Some(_) => G.unit\n    }\n    getToken <- liftK(repo.getOrganizationAccessToken(organizationId).memoize)\n    // notice we run in parallel (parTraverse) to use our accumulating parallel instance\n    res <- Hxl.runSequential(inputs.parTraverse(iu => run(iu, getToken)).hxl)\n  } yield res\n\n  ga.value\n}\n"})}),"\n",(0,r.jsxs)(n.p,{children:["The code is now a lot shorter and we can use closures (flatMap) to express our program.\nWe solved issue 1 and 5 with ",(0,r.jsx)(n.code,{children:"Hxl"}),"."]}),"\n",(0,r.jsxs)(n.h2,{id:"erasing-eithert",children:["Erasing ",(0,r.jsx)(n.code,{children:"EitherT"})]}),"\n",(0,r.jsxs)(n.p,{children:["A lot of the code's remaining complexity is due to our use of ",(0,r.jsx)(n.code,{children:"EitherT"}),".\nPulling in a tool to algebraically solve a problem will yet again be our salvation."]}),"\n",(0,r.jsxs)(n.p,{children:["A capability based utility named ",(0,r.jsx)(n.a,{href:"https://github.com/ValdemarGr/catch-effect",children:"catch-effect"})," that I have authored will aid us in this task.\n",(0,r.jsx)(n.code,{children:"catch-effect"})," allows us to write as if using MTL, but without the need for monad transformers.\n",(0,r.jsx)(n.code,{children:"catch-effect"})," provides a structure ",(0,r.jsx)(n.code,{children:"Catch"})," that can open local scopes where errors can be raised and caught:"]}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:'def example(c: Catch[IO]): IO[Either[Error, String]] =\n  c.use[Error] { (h: Handle[IO, Error]) =>\n    h.raise(PhoneParseError("error")) *> IO("I will never happen")\n  }\n'})}),"\n",(0,r.jsx)(n.p,{children:"Let us take a step back and relax our accumulating errors constraint for the next iteration."}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"def insertUsers(\n  organizationId: UUID,\n  inputs: NonEmptyList[InputUser],\n  api: UserApi,\n  repo: Repo,\n  c: Catch[IO]\n): IO[Either[Error, NonEmptyList[UUID]]] = c.use[Error] { h =>\n  def run(input: InputUser, getToken: IO[String]): HxlM[IO, UUID] = \n    for {\n      phone <- HxlM.liftF {\n        h.fromEither(parsePhone(input.phone).leftMap(x => PhoneParseError(x)))\n      }\n      tokOpt <- HxlM.liftF(getToken).map(_.some.filter(_ => input.shouldBeCreatedInApi))\n      apiId <- tokOpt.traverse(createUser(CreateUser(input.name, phone), _, api)).monadic\n      id <- HxlM.liftF(UUIDGen.randomUUID[IO])\n      u = User(id, input.name, input.age, phone, apiId, organizationId)\n      _ <- insertUser(u, repo).monadic\n    } yield id\n\n  for {\n    _ <- h.fromOptionF(OrganizationNotFound())(repo.getOrganization(organizationId))\n    getToken <- repo.getOrganizationAccessToken(organizationId).memoize\n    res <- Hxl.runSequential(inputs.traverse(iu => run(iu, getToken).hxl))\n  } yield res\n}\n"})}),"\n",(0,r.jsx)(n.p,{children:"Now let's restore our wish for accumulating errors."}),"\n",(0,r.jsxs)(n.p,{children:["When we worked with ",(0,r.jsx)(n.code,{children:"EitherT"}),", we had to pick a ",(0,r.jsx)(n.code,{children:"Parallel"})," instance for ",(0,r.jsx)(n.code,{children:"EitherT"})," that would accumulate errors.\nThe default ",(0,r.jsx)(n.code,{children:"Parallel"})," instance for ",(0,r.jsx)(n.code,{children:"IO"})," will for any two effects, run their effects as two parallel fibers.\n",(0,r.jsx)(n.code,{children:"IO"}),", however, cannot reason with errors from ",(0,r.jsx)(n.code,{children:"catch-effect"}),".\nFortunately ",(0,r.jsx)(n.code,{children:"catch-effect"})," can construct a ",(0,r.jsx)(n.code,{children:"Parallel"})," accumulating instance for ",(0,r.jsx)(n.code,{children:"IO"})," (given that ",(0,r.jsx)(n.code,{children:"E"})," forms a ",(0,r.jsx)(n.code,{children:"Semigroup"}),"), just like ",(0,r.jsx)(n.code,{children:"EitherT"}),"!.\nWhen we slam all of our ",(0,r.jsx)(n.code,{children:"Hxl"}),"s together, we will do so in parallel, using the enchanced ",(0,r.jsx)(n.code,{children:"Parallel"})," instance from ",(0,r.jsx)(n.code,{children:"catch-effect"}),"."]}),"\n",(0,r.jsx)(n.pre,{children:(0,r.jsx)(n.code,{className:"language-scala",children:"def insertUsers(\n  organizationId: UUID,\n  inputs: NonEmptyList[InputUser],\n  api: UserApi,\n  repo: Repo,\n  c: Catch[IO]\n): IO[Either[Errors, NonEmptyList[UUID]]] = c.use[Errors] { h =>\n  implicit val parallel: Parallel[HxlM[IO, *]] = \n    hxl.instances.hxlm.parallel.parallelHxlMForParallelEffect(h.accumulatingParallelForParallel)\n  def run(input: InputUser, getToken: IO[String]): HxlM[IO, UUID] = \n    for {\n      phone <- HxlM.liftF {\n        h.fromEither(parsePhone(input.phone).leftMap(x => NonEmptyChain.one(PhoneParseError(x))))\n      }\n      tokOpt <- HxlM.liftF(getToken).map(_.some.filter(_ => input.shouldBeCreatedInApi))\n      apiId <- tokOpt.traverse(createUser(CreateUser(input.name, phone), _, api)).monadic\n      id <- HxlM.liftF(UUIDGen.randomUUID[IO])\n      u = User(id, input.name, input.age, phone, apiId, organizationId)\n      _ <- insertUser(u, repo).monadic\n    } yield id\n\n  for {\n    _ <- h.fromOptionF(NonEmptyChain.one(OrganizationNotFound())) { \n      repo.getOrganization(organizationId)\n    }\n    getToken <- repo.getOrganizationAccessToken(organizationId).memoize\n    res <- Hxl.runSequential(inputs.parTraverse(iu => run(iu, getToken)).hxl)\n  } yield res\n}\n"})}),"\n",(0,r.jsx)(n.p,{children:"And that's it.\nWe went though a lot of stuff, but we ended up with a much shorter solution.\nThe data sources we created can also be reused in other parts of our application."}),"\n",(0,r.jsx)(n.h2,{id:"conclusion",children:"Conclusion"}),"\n",(0,r.jsx)(n.p,{children:"The line-of-code reduction between the first semantically correct solution and the final one was not negligible, but we had to add extra abstractions to get there."}),"\n",(0,r.jsx)(n.p,{children:"The final solution requires more knowledge of the generic abstractions, and reduces the required problem-specific knowledge for readers of the code.\nHowever the initial solution is easier for someone who is not familiar with the abstractions to understand."}),"\n",(0,r.jsx)(n.p,{children:"If an abstraction has a foundational nature, is principled and practical, then I believe it is worth the effort to learn."}),"\n",(0,r.jsxs)(n.p,{children:["Our interest in the relationship between ",(0,r.jsx)(n.code,{children:"Monad"})," and ",(0,r.jsx)(n.code,{children:"Applicative"})," is of foundational nature, the interest in dependent and independent things.\n",(0,r.jsx)(n.code,{children:"Parallel"})," is an abstraction that lets us reason with structures that can be given multiple semantics, some of which form a ",(0,r.jsx)(n.code,{children:"Monad"})," and some of which form an ",(0,r.jsx)(n.code,{children:"Applicative"}),"."]}),"\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.code,{children:"Hxl"})," is a principled solution to batching, however it is more of an engineering solution than a mathematical construction.\nRegardless, ",(0,r.jsx)(n.code,{children:"Hxl"})," almost cuts the problem size in half and is generally applicable."]}),"\n",(0,r.jsxs)(n.p,{children:[(0,r.jsx)(n.code,{children:"catch-effect"})," introduces algebras (MTL) that are well established in functional programming.\n",(0,r.jsx)(n.code,{children:"catch-effect"})," is a pragmatic solution born from modern effect research of algebraic effects and capabilities.\nHowever, ",(0,r.jsx)(n.code,{children:"catch-effect"})," is the only abstraction that we have explored which cannot be graced with a sound api (capture checking)."]}),"\n",(0,r.jsxs)(n.p,{children:["Unfortunately, ambiguity is involved in picking the right ",(0,r.jsx)(n.code,{children:"Parallel"})," instance, be it ",(0,r.jsx)(n.code,{children:"EitherT"})," or ",(0,r.jsx)(n.code,{children:"IO"})," with ",(0,r.jsx)(n.code,{children:"catch-effect"}),".\nI suppose the nature of ",(0,r.jsx)(n.code,{children:"Parallel"})," is reasoning with ambiguity, being that ",(0,r.jsx)(n.code,{children:"Parallel"})," instances for monad transformers are sometimes defined by another ",(0,r.jsx)(n.code,{children:"Parallel"})," instance.\nConsider this table for ambigious semantics for ",(0,r.jsx)(n.code,{children:"IO"})," (or ",(0,r.jsx)(n.code,{children:"EitherT"})," for that matter):"]}),"\n",(0,r.jsxs)(n.table,{children:[(0,r.jsx)(n.thead,{children:(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.th,{children:"IO"}),(0,r.jsx)(n.th,{children:"IO with error E1"})]})}),(0,r.jsxs)(n.tbody,{children:[(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Par"})]}),(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Seq"})]}),(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Seq"}),(0,r.jsx)(n.td,{children:"Par"})]})]})]}),"\n",(0,r.jsxs)(n.p,{children:["There is no unique ",(0,r.jsx)(n.code,{children:"Parallel"})," definition for ",(0,r.jsx)(n.code,{children:"IO"})," anymore.\nNow what happens if we introduce another error?"]}),"\n",(0,r.jsxs)(n.table,{children:[(0,r.jsx)(n.thead,{children:(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.th,{children:"IO"}),(0,r.jsx)(n.th,{children:"IO with error E1"}),(0,r.jsx)(n.th,{children:"IO with error E2"})]})}),(0,r.jsxs)(n.tbody,{children:[(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Seq"})]}),(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Seq"}),(0,r.jsx)(n.td,{children:"Seq"})]}),(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Seq"}),(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Seq"})]}),(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Par"})]}),(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Seq"}),(0,r.jsx)(n.td,{children:"Par"})]}),(0,r.jsxs)(n.tr,{children:[(0,r.jsx)(n.td,{children:"Seq"}),(0,r.jsx)(n.td,{children:"Par"}),(0,r.jsx)(n.td,{children:"Par"})]})]})]}),"\n",(0,r.jsxs)(n.p,{children:["In fact, the choices grow by ",(0,r.jsxs)(n.span,{className:"katex",children:[(0,r.jsx)(n.span,{className:"katex-mathml",children:(0,r.jsx)(n.math,{xmlns:"http://www.w3.org/1998/Math/MathML",children:(0,r.jsxs)(n.semantics,{children:[(0,r.jsx)(n.mrow,{children:(0,r.jsxs)(n.msup,{children:[(0,r.jsx)(n.mn,{children:"2"}),(0,r.jsx)(n.mi,{children:"n"})]})}),(0,r.jsx)(n.annotation,{encoding:"application/x-tex",children:"2^n"})]})})}),(0,r.jsx)(n.span,{className:"katex-html","aria-hidden":"true",children:(0,r.jsxs)(n.span,{className:"base",children:[(0,r.jsx)(n.span,{className:"strut",style:{height:"0.6644em"}}),(0,r.jsxs)(n.span,{className:"mord",children:[(0,r.jsx)(n.span,{className:"mord",children:"2"}),(0,r.jsx)(n.span,{className:"msupsub",children:(0,r.jsx)(n.span,{className:"vlist-t",children:(0,r.jsx)(n.span,{className:"vlist-r",children:(0,r.jsx)(n.span,{className:"vlist",style:{height:"0.6644em"},children:(0,r.jsxs)(n.span,{style:{top:"-3.063em",marginRight:"0.05em"},children:[(0,r.jsx)(n.span,{className:"pstrut",style:{height:"2.7em"}}),(0,r.jsx)(n.span,{className:"sizing reset-size6 size3 mtight",children:(0,r.jsx)(n.span,{className:"mord mathnormal mtight",children:"n"})})]})})})})})]})]})})]})," where ",(0,r.jsxs)(n.span,{className:"katex",children:[(0,r.jsx)(n.span,{className:"katex-mathml",children:(0,r.jsx)(n.math,{xmlns:"http://www.w3.org/1998/Math/MathML",children:(0,r.jsxs)(n.semantics,{children:[(0,r.jsx)(n.mrow,{children:(0,r.jsx)(n.mi,{children:"n"})}),(0,r.jsx)(n.annotation,{encoding:"application/x-tex",children:"n"})]})})}),(0,r.jsx)(n.span,{className:"katex-html","aria-hidden":"true",children:(0,r.jsxs)(n.span,{className:"base",children:[(0,r.jsx)(n.span,{className:"strut",style:{height:"0.4306em"}}),(0,r.jsx)(n.span,{className:"mord mathnormal",children:"n"})]})})]})," is the number of error channels."]}),"\n",(0,r.jsx)(n.p,{children:"Thank you for reading, I hope that at least some of the ideas and abstractions presented in this post were of interest."})]})}function h(e={}){const{wrapper:n}={...(0,t.a)(),...e.components};return n?(0,r.jsx)(n,{...e,children:(0,r.jsx)(d,{...e})}):d(e)}}}]);